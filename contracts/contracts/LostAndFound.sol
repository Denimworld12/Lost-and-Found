// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title Campus Lost & Found escrow
/// @notice Owners lock an ETH reward for a lost item; a verified finder claims it by locking a
/// small deposit. The owner confirms the return (or the confirm window times out) and the finder
/// is credited reward + deposit. Disputes go to an arbiter. All payouts are pull payments.
/// @dev Nothing personal is stored: only addresses, amounts, statuses, IPFS CIDs and timestamps.
/// State changes only credit `balances`; `withdraw` is the single function that sends ETH.
contract LostAndFound is AccessControl, ReentrancyGuard, Pausable {
    // ─────────────────────────────────────────────────────────────── Types

    /// @dev `None` = 0 so a missing item is detectable (`items[id].status == Status.None`).
    enum Status {
        None,
        Open,
        Claimed,
        Disputed,
        Completed,
        Cancelled
    }

    struct Item {
        address owner; // slot 1: owner (20) + status (1) + createdAt (8)
        Status status;
        uint64 createdAt;
        address finder; // slot 2: finder (20) + claimedAt (8)
        uint64 claimedAt;
        uint128 reward; // slot 3: reward + stake
        uint128 stake; // deposit locked at claim time
        string metadataCID; // IPFS CID of the metadata JSON (max 100 bytes)
    }

    // ─────────────────────────────────────────────────────────────── Roles and limits

    /// @notice Role allowed to add and remove students from the whitelist.
    bytes32 public constant VERIFIER_ROLE = keccak256("VERIFIER_ROLE");
    /// @notice Role allowed to resolve disputes.
    bytes32 public constant ARBITER_ROLE = keccak256("ARBITER_ROLE");

    /// @notice Shortest allowed confirm window.
    uint64 public constant MIN_CONFIRM_WINDOW = 5 minutes;
    /// @notice Longest allowed confirm window.
    uint64 public constant MAX_CONFIRM_WINDOW = 14 days;
    /// @notice Longest allowed metadata CID, in bytes.
    uint256 public constant MAX_CID_LENGTH = 100;

    // ─────────────────────────────────────────────────────────────── Storage

    mapping(uint256 => Item) internal items;

    /// @notice Last assigned item ID. IDs start at 1.
    uint256 public itemCount;
    /// @notice Withdrawable credit per address (pull payments).
    mapping(address => uint256) public balances;
    /// @notice Student whitelist. Only verified students can post or claim.
    mapping(address => bool) public isVerified;
    /// @notice Sum of rewards and deposits held for items that are not final yet.
    uint256 public totalEscrowed;
    /// @notice Sum of all `balances`.
    uint256 public totalCredited;

    /// @notice Smallest reward an owner can lock, in wei.
    uint256 public minReward;
    /// @notice Deposit a finder locks when claiming, in wei. Applies to new claims only.
    uint256 public claimStake;
    /// @notice Time the owner has to respond to a claim, in seconds.
    uint64 public confirmWindow;

    // ─────────────────────────────────────────────────────────────── Errors

    error NotVerified();
    error NotOwner();
    error NotFinder();
    error NotParty();
    error ItemNotFound();
    error WrongStatus(Status expected, Status actual);
    error RewardTooLow();
    error RewardTooHigh();
    error WrongStake();
    error OwnerCannotClaim();
    error WindowOpen();
    error WindowClosed();
    error InvalidCID();
    error NothingToWithdraw();
    error TransferFailed();
    error InvalidConfig();
    error ZeroAddress();
    error DirectPaymentNotAllowed();

    // ─────────────────────────────────────────────────────────────── Events

    event ItemPosted(uint256 indexed id, address indexed owner, uint256 reward, string cid);
    event ItemClaimed(uint256 indexed id, address indexed finder, uint256 stake);
    event ReturnConfirmed(uint256 indexed id, address indexed finder, uint256 amount);
    event ClaimRejected(uint256 indexed id, address indexed finder, uint256 stakeToOwner);
    event DisputeRaised(uint256 indexed id, address indexed by);
    event DisputeResolved(uint256 indexed id, bool finderWins, address indexed arbiter);
    event TimeoutClaimed(uint256 indexed id, address indexed finder, uint256 amount);
    event ItemCancelled(uint256 indexed id);
    event Withdrawn(address indexed to, uint256 amount);
    event StudentVerified(address indexed student);
    event StudentRevoked(address indexed student);
    event ConfigUpdated(uint256 minReward, uint256 claimStake, uint64 confirmWindow);

    // ─────────────────────────────────────────────────────────────── Modifiers

    modifier onlyVerified() {
        if (!isVerified[msg.sender]) revert NotVerified();
        _;
    }

    /// @dev IDs are assigned 1..itemCount and items are never deleted, so this range check is
    /// equivalent to `items[id].status != Status.None`.
    modifier itemExists(uint256 id) {
        if (id == 0 || id > itemCount) revert ItemNotFound();
        _;
    }

    // ─────────────────────────────────────────────────────────────── Constructor

    /// @notice Deploys the escrow with its role holders and starting config.
    /// @param admin Holder of DEFAULT_ADMIN_ROLE (config, pause, role management).
    /// @param verifier Holder of VERIFIER_ROLE (student whitelist).
    /// @param arbiter Holder of ARBITER_ROLE (dispute resolution).
    /// @param minReward_ Smallest reward in wei.
    /// @param claimStake_ Finder deposit in wei.
    /// @param confirmWindow_ Owner response window in seconds (5 minutes to 14 days).
    constructor(
        address admin,
        address verifier,
        address arbiter,
        uint256 minReward_,
        uint256 claimStake_,
        uint64 confirmWindow_
    ) {
        if (admin == address(0) || verifier == address(0) || arbiter == address(0)) {
            revert ZeroAddress();
        }
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(VERIFIER_ROLE, verifier);
        _grantRole(ARBITER_ROLE, arbiter);
        _setConfig(minReward_, claimStake_, confirmWindow_);
    }

    // ─────────────────────────────────────────────────────────────── Owner and finder flows

    /// @notice Posts a lost item and locks `msg.value` as its reward.
    /// @dev Caller must be a verified student and the contract must not be paused.
    /// @param cid IPFS CID of the item's metadata JSON (1 to 100 bytes).
    /// @return id The new item's ID.
    function postItem(
        string calldata cid
    ) external payable onlyVerified whenNotPaused returns (uint256 id) {
        if (msg.value < minReward) revert RewardTooLow();
        if (msg.value > type(uint128).max) revert RewardTooHigh();
        uint256 cidLength = bytes(cid).length;
        if (cidLength == 0 || cidLength > MAX_CID_LENGTH) revert InvalidCID();

        id = ++itemCount;
        items[id] = Item({
            owner: msg.sender,
            status: Status.Open,
            createdAt: uint64(block.timestamp),
            finder: address(0),
            claimedAt: 0,
            reward: uint128(msg.value),
            stake: 0,
            metadataCID: cid
        });
        totalEscrowed += msg.value;

        emit ItemPosted(id, msg.sender, msg.value, cid);
    }

    /// @notice Claims an open item as its finder by locking exactly `claimStake` as a deposit.
    /// @dev The deposit amount is stored on the item, so later config changes don't affect it.
    /// @param id Item ID.
    function claimItem(uint256 id) external payable onlyVerified whenNotPaused itemExists(id) {
        Item storage item = items[id];
        if (item.status != Status.Open) revert WrongStatus(Status.Open, item.status);
        if (msg.sender == item.owner) revert OwnerCannotClaim();
        if (msg.value != claimStake) revert WrongStake();

        item.finder = msg.sender;
        item.stake = uint128(msg.value);
        item.claimedAt = uint64(block.timestamp);
        item.status = Status.Claimed;
        totalEscrowed += msg.value;

        emit ItemClaimed(id, msg.sender, msg.value);
    }

    /// @notice Owner confirms the item came back. Credits the finder reward + deposit.
    /// @dev Allowed at any time while Claimed, including after the confirm window.
    /// @param id Item ID.
    function confirmReturn(uint256 id) external itemExists(id) {
        Item storage item = items[id];
        if (msg.sender != item.owner) revert NotOwner();
        if (item.status != Status.Claimed) revert WrongStatus(Status.Claimed, item.status);

        item.status = Status.Completed;
        address finder = item.finder;
        uint256 amount = uint256(item.reward) + item.stake;
        _credit(finder, amount);

        emit ReturnConfirmed(id, finder, amount);
    }

    /// @notice Owner rejects a claim within the confirm window. The finder's deposit is credited
    /// to the owner and the item is open again.
    /// @param id Item ID.
    function rejectClaim(uint256 id) external itemExists(id) {
        Item storage item = items[id];
        if (msg.sender != item.owner) revert NotOwner();
        if (item.status != Status.Claimed) revert WrongStatus(Status.Claimed, item.status);
        if (!_withinWindow(item)) revert WindowClosed();

        address finder = item.finder;
        uint256 stake = item.stake;
        item.finder = address(0);
        item.stake = 0;
        item.claimedAt = 0;
        item.status = Status.Open;
        _credit(msg.sender, stake);

        emit ClaimRejected(id, finder, stake);
    }

    /// @notice Owner or finder raises a dispute within the confirm window. An arbiter decides.
    /// @param id Item ID.
    function raiseDispute(uint256 id) external itemExists(id) {
        Item storage item = items[id];
        if (msg.sender != item.owner && msg.sender != item.finder) revert NotParty();
        if (item.status != Status.Claimed) revert WrongStatus(Status.Claimed, item.status);
        if (!_withinWindow(item)) revert WindowClosed();

        item.status = Status.Disputed;

        emit DisputeRaised(id, msg.sender);
    }

    /// @notice Finder collects reward + deposit after the owner let the confirm window pass.
    /// @dev "Window passed" means `block.timestamp > claimedAt + confirmWindow` (strictly).
    /// @param id Item ID.
    function claimAfterTimeout(uint256 id) external itemExists(id) {
        Item storage item = items[id];
        if (msg.sender != item.finder) revert NotFinder();
        if (item.status != Status.Claimed) revert WrongStatus(Status.Claimed, item.status);
        if (_withinWindow(item)) revert WindowOpen();

        item.status = Status.Completed;
        uint256 amount = uint256(item.reward) + item.stake;
        _credit(msg.sender, amount);

        emit TimeoutClaimed(id, msg.sender, amount);
    }

    /// @notice Owner cancels an open listing. The reward is credited back to the owner.
    /// @param id Item ID.
    function cancelItem(uint256 id) external itemExists(id) {
        Item storage item = items[id];
        if (msg.sender != item.owner) revert NotOwner();
        if (item.status != Status.Open) revert WrongStatus(Status.Open, item.status);

        item.status = Status.Cancelled;
        _credit(msg.sender, item.reward);

        emit ItemCancelled(id);
    }

    /// @notice Sends the caller their whole credited balance.
    /// @dev Balance is zeroed before the external call; guarded by `nonReentrant`.
    function withdraw() external nonReentrant {
        uint256 amount = balances[msg.sender];
        if (amount == 0) revert NothingToWithdraw();

        balances[msg.sender] = 0;
        totalCredited -= amount;
        emit Withdrawn(msg.sender, amount);

        (bool ok, ) = payable(msg.sender).call{value: amount}("");
        if (!ok) revert TransferFailed();
    }

    // ─────────────────────────────────────────────────────────────── Arbiter

    /// @notice Arbiter settles a disputed item.
    /// @dev Finder wins: Completed, finder credited reward + deposit. Owner wins: owner credited
    /// the deposit and the item reopens as Open with the reward still escrowed.
    /// @param id Item ID.
    /// @param finderWins True to pay the finder, false to return the item to the owner.
    function resolveDispute(
        uint256 id,
        bool finderWins
    ) external onlyRole(ARBITER_ROLE) itemExists(id) {
        Item storage item = items[id];
        if (item.status != Status.Disputed) revert WrongStatus(Status.Disputed, item.status);

        if (finderWins) {
            item.status = Status.Completed;
            _credit(item.finder, uint256(item.reward) + item.stake);
        } else {
            uint256 stake = item.stake;
            item.finder = address(0);
            item.stake = 0;
            item.claimedAt = 0;
            item.status = Status.Open;
            _credit(item.owner, stake);
        }

        emit DisputeResolved(id, finderWins, msg.sender);
    }

    // ─────────────────────────────────────────────────────────────── Verifier

    /// @notice Adds a student wallet to the whitelist.
    /// @param s Student wallet address.
    function verifyStudent(address s) external onlyRole(VERIFIER_ROLE) {
        _verify(s);
    }

    /// @notice Adds several student wallets to the whitelist.
    /// @param s Student wallet addresses.
    function verifyStudents(address[] calldata s) external onlyRole(VERIFIER_ROLE) {
        uint256 length = s.length;
        for (uint256 i = 0; i < length; ++i) {
            _verify(s[i]);
        }
    }

    /// @notice Removes a student wallet from the whitelist. Their existing items still finish.
    /// @param s Student wallet address.
    function revokeStudent(address s) external onlyRole(VERIFIER_ROLE) {
        isVerified[s] = false;
        emit StudentRevoked(s);
    }

    // ─────────────────────────────────────────────────────────────── Admin

    /// @notice Updates the config for new posts and claims. Existing claims keep their deposit.
    /// @param minReward_ Smallest reward in wei (> 0, fits in uint128).
    /// @param claimStake_ Finder deposit in wei (> 0, fits in uint128).
    /// @param confirmWindow_ Owner response window in seconds (5 minutes to 14 days).
    function setConfig(
        uint256 minReward_,
        uint256 claimStake_,
        uint64 confirmWindow_
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _setConfig(minReward_, claimStake_, confirmWindow_);
    }

    /// @notice Pauses posting and claiming. Every other flow keeps working.
    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    /// @notice Resumes posting and claiming.
    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    // ─────────────────────────────────────────────────────────────── Views

    /// @notice Returns an item.
    /// @param id Item ID.
    /// @return The item's full record.
    function getItem(uint256 id) external view itemExists(id) returns (Item memory) {
        return items[id];
    }

    /// @notice Whether an item's claim is still inside the confirm window.
    /// @dev `block.timestamp <= claimedAt + confirmWindow`. Only meaningful while Claimed.
    /// @param id Item ID.
    /// @return True while the owner can still reject or either party can dispute.
    function withinWindow(uint256 id) external view returns (bool) {
        return _withinWindow(items[id]);
    }

    // ─────────────────────────────────────────────────────────────── Direct payments

    /// @notice Rejects plain ETH transfers so funds can't be sent by mistake.
    receive() external payable {
        revert DirectPaymentNotAllowed();
    }

    /// @notice Rejects calls to unknown functions.
    fallback() external payable {
        revert DirectPaymentNotAllowed();
    }

    // ─────────────────────────────────────────────────────────────── Internal

    function _withinWindow(Item storage item) private view returns (bool) {
        return block.timestamp <= uint256(item.claimedAt) + confirmWindow;
    }

    /// @dev Moves `amount` from escrow to `to`'s withdrawable balance.
    function _credit(address to, uint256 amount) private {
        totalEscrowed -= amount;
        totalCredited += amount;
        balances[to] += amount;
    }

    function _verify(address s) private {
        if (s == address(0)) revert ZeroAddress();
        isVerified[s] = true;
        emit StudentVerified(s);
    }

    function _setConfig(uint256 minReward_, uint256 claimStake_, uint64 confirmWindow_) private {
        if (
            minReward_ == 0 ||
            minReward_ > type(uint128).max ||
            claimStake_ == 0 ||
            claimStake_ > type(uint128).max ||
            confirmWindow_ < MIN_CONFIRM_WINDOW ||
            confirmWindow_ > MAX_CONFIRM_WINDOW
        ) revert InvalidConfig();

        minReward = minReward_;
        claimStake = claimStake_;
        confirmWindow = confirmWindow_;

        emit ConfigUpdated(minReward_, claimStake_, confirmWindow_);
    }
}
