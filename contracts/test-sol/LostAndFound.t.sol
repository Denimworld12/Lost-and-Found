// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";

import {LostAndFound} from "../contracts/LostAndFound.sol";

uint256 constant MIN_REWARD = 0.001 ether;
uint256 constant STAKE = 0.0005 ether;
uint64 constant WINDOW = 3 days;
string constant CID = "bafkreigh2akiscaildcqabsyg3dfr6chu3fgpregiymsck7e7aqa4s52zy";

/// @notice Fuzz tests for amounts and the confirm-window edge.
contract LostAndFoundFuzzTest is Test {
    LostAndFound internal lf;
    address internal owner = makeAddr("owner");
    address internal finder = makeAddr("finder");

    function setUp() public {
        lf = new LostAndFound(
            address(this),
            address(this),
            address(this),
            MIN_REWARD,
            STAKE,
            WINDOW
        );
        lf.verifyStudent(owner);
        lf.verifyStudent(finder);
    }

    function _postAndClaim() internal returns (uint256 id, uint64 claimedAt) {
        vm.deal(owner, 1 ether);
        vm.prank(owner);
        id = lf.postItem{value: 0.01 ether}(CID);
        vm.deal(finder, STAKE);
        vm.prank(finder);
        lf.claimItem{value: STAKE}(id);
        claimedAt = lf.getItem(id).claimedAt;
    }

    function testFuzz_PostItemReward(uint256 reward) public {
        vm.deal(owner, reward);
        vm.prank(owner);
        if (reward < MIN_REWARD) {
            vm.expectRevert(LostAndFound.RewardTooLow.selector);
            lf.postItem{value: reward}(CID);
            return;
        }
        if (reward > type(uint128).max) {
            vm.expectRevert(LostAndFound.RewardTooHigh.selector);
            lf.postItem{value: reward}(CID);
            return;
        }
        uint256 id = lf.postItem{value: reward}(CID);
        assertEq(id, 1);
        assertEq(lf.getItem(id).reward, reward);
        assertEq(lf.totalEscrowed(), reward);
        assertEq(address(lf).balance, reward);
    }

    function testFuzz_ClaimItemStake(uint256 value) public {
        // Values above uint128 would overflow the EVM's own balance math, not reach the contract.
        value = bound(value, 0, type(uint128).max);
        vm.deal(owner, 1 ether);
        vm.prank(owner);
        uint256 id = lf.postItem{value: 0.01 ether}(CID);

        vm.deal(finder, value);
        vm.prank(finder);
        if (value != STAKE) {
            vm.expectRevert(LostAndFound.WrongStake.selector);
            lf.claimItem{value: value}(id);
            return;
        }
        lf.claimItem{value: value}(id);
        assertEq(lf.getItem(id).stake, STAKE);
        assertEq(lf.totalEscrowed(), 0.01 ether + STAKE);
    }

    function testFuzz_ClaimStakeFollowsConfig(uint128 newStake) public {
        newStake = uint128(bound(newStake, 1, type(uint128).max));
        lf.setConfig(MIN_REWARD, newStake, WINDOW);

        vm.deal(owner, 1 ether);
        vm.prank(owner);
        uint256 id = lf.postItem{value: 0.01 ether}(CID);
        vm.deal(finder, newStake);
        vm.prank(finder);
        lf.claimItem{value: newStake}(id);
        assertEq(lf.getItem(id).stake, newStake);
    }

    /// @dev Any later window change leaves an existing claim's window at WINDOW.
    function testFuzz_ConfigChangeKeepsClaimWindow(uint64 newWindow) public {
        newWindow = uint64(bound(newWindow, lf.MIN_CONFIRM_WINDOW(), lf.MAX_CONFIRM_WINDOW()));
        (uint256 id, uint64 claimedAt) = _postAndClaim();
        lf.setConfig(MIN_REWARD, STAKE, newWindow);

        assertEq(lf.getItem(id).claimWindow, WINDOW);
        vm.warp(uint256(claimedAt) + WINDOW);
        assertTrue(lf.withinWindow(id));
        vm.warp(uint256(claimedAt) + WINDOW + 1);
        assertFalse(lf.withinWindow(id));
    }

    /// @dev Offsets <= 0 are inside the window (WindowOpen); > 0 are after it.
    function testFuzz_ClaimAfterTimeoutEdge(int256 offset) public {
        offset = bound(offset, -int256(uint256(WINDOW)), int256(uint256(WINDOW)));
        (uint256 id, uint64 claimedAt) = _postAndClaim();

        vm.warp(uint256(int256(uint256(claimedAt) + WINDOW) + offset));
        if (offset <= 0) {
            assertTrue(lf.withinWindow(id));
            vm.prank(finder);
            vm.expectRevert(LostAndFound.WindowOpen.selector);
            lf.claimAfterTimeout(id);
            return;
        }
        assertFalse(lf.withinWindow(id));
        vm.prank(finder);
        lf.claimAfterTimeout(id);
        assertEq(lf.balances(finder), 0.01 ether + STAKE);
        assertEq(uint8(lf.getItem(id).status), uint8(LostAndFound.Status.Completed));
    }

    /// @dev Mirror of the timeout edge: rejecting works through the edge and fails after.
    function testFuzz_RejectClaimEdge(int256 offset) public {
        offset = bound(offset, -int256(uint256(WINDOW)), int256(uint256(WINDOW)));
        (uint256 id, uint64 claimedAt) = _postAndClaim();

        vm.warp(uint256(int256(uint256(claimedAt) + WINDOW) + offset));
        vm.prank(owner);
        if (offset > 0) {
            vm.expectRevert(LostAndFound.WindowClosed.selector);
            lf.rejectClaim(id);
            return;
        }
        lf.rejectClaim(id);
        assertEq(lf.balances(owner), STAKE);
        assertEq(uint8(lf.getItem(id).status), uint8(LostAndFound.Status.Open));
    }
}

/// @notice Drives random sequences of actions for the invariant test.
contract Handler is Test {
    LostAndFound public immutable lf;
    address[] public actors;
    /// @dev Ghost: rewards + stakes of items that are not final.
    uint256 public ghostEscrowed;
    uint256 public ghostWithdrawn;

    constructor(LostAndFound lf_, address[] memory actors_) {
        lf = lf_;
        actors = actors_;
    }

    function actorCount() external view returns (uint256) {
        return actors.length;
    }

    function _actor(uint256 seed) internal view returns (address) {
        return actors[seed % actors.length];
    }

    function _id(uint256 seed) internal view returns (uint256) {
        uint256 count = lf.itemCount();
        return count == 0 ? 0 : (seed % count) + 1;
    }

    function _status(uint256 id) internal view returns (LostAndFound.Status) {
        return lf.getItem(id).status;
    }

    function post(uint256 actorSeed, uint256 reward) external {
        reward = bound(reward, MIN_REWARD, 10 ether);
        address a = _actor(actorSeed);
        vm.deal(a, a.balance + reward);
        vm.prank(a);
        lf.postItem{value: reward}(CID);
        ghostEscrowed += reward;
    }

    function claim(uint256 actorSeed, uint256 idSeed) external {
        uint256 id = _id(idSeed);
        if (id == 0) return;
        LostAndFound.Item memory item = lf.getItem(id);
        address a = _actor(actorSeed);
        if (item.status != LostAndFound.Status.Open || a == item.owner) return;
        uint256 stake = lf.claimStake();
        vm.deal(a, a.balance + stake);
        vm.prank(a);
        lf.claimItem{value: stake}(id);
        ghostEscrowed += stake;
    }

    function confirm(uint256 idSeed) external {
        uint256 id = _id(idSeed);
        if (id == 0) return;
        LostAndFound.Item memory item = lf.getItem(id);
        if (item.status != LostAndFound.Status.Claimed) return;
        vm.prank(item.owner);
        lf.confirmReturn(id);
        ghostEscrowed -= uint256(item.reward) + item.stake;
    }

    function reject(uint256 idSeed) external {
        uint256 id = _id(idSeed);
        if (id == 0) return;
        LostAndFound.Item memory item = lf.getItem(id);
        if (item.status != LostAndFound.Status.Claimed || !lf.withinWindow(id)) return;
        vm.prank(item.owner);
        lf.rejectClaim(id);
        ghostEscrowed -= item.stake;
    }

    function dispute(uint256 idSeed, bool byFinder) external {
        uint256 id = _id(idSeed);
        if (id == 0) return;
        LostAndFound.Item memory item = lf.getItem(id);
        if (item.status != LostAndFound.Status.Claimed || !lf.withinWindow(id)) return;
        vm.prank(byFinder ? item.finder : item.owner);
        lf.raiseDispute(id);
    }

    function resolve(uint256 idSeed, bool finderWins) external {
        uint256 id = _id(idSeed);
        if (id == 0) return;
        LostAndFound.Item memory item = lf.getItem(id);
        if (item.status != LostAndFound.Status.Disputed) return;
        lf.resolveDispute(id, finderWins);
        ghostEscrowed -= finderWins ? uint256(item.reward) + item.stake : item.stake;
    }

    function timeout(uint256 idSeed) external {
        uint256 id = _id(idSeed);
        if (id == 0) return;
        LostAndFound.Item memory item = lf.getItem(id);
        if (item.status != LostAndFound.Status.Claimed) return;
        uint256 windowEnd = uint256(item.claimedAt) + item.claimWindow;
        if (block.timestamp <= windowEnd) vm.warp(windowEnd + 1);
        vm.prank(item.finder);
        lf.claimAfterTimeout(id);
        ghostEscrowed -= uint256(item.reward) + item.stake;
    }

    function cancel(uint256 idSeed) external {
        uint256 id = _id(idSeed);
        if (id == 0) return;
        LostAndFound.Item memory item = lf.getItem(id);
        if (item.status != LostAndFound.Status.Open) return;
        vm.prank(item.owner);
        lf.cancelItem(id);
        ghostEscrowed -= item.reward;
    }

    function withdraw(uint256 actorSeed) external {
        address a = _actor(actorSeed);
        uint256 amount = lf.balances(a);
        if (amount == 0) return;
        vm.prank(a);
        lf.withdraw();
        ghostWithdrawn += amount;
    }

    function changeStake(uint256 stake) external {
        stake = bound(stake, 1, 1 ether);
        lf.setConfig(lf.minReward(), stake, lf.confirmWindow());
    }

    function changeWindow(uint64 window) external {
        window = uint64(bound(window, lf.MIN_CONFIRM_WINDOW(), lf.MAX_CONFIRM_WINDOW()));
        lf.setConfig(lf.minReward(), lf.claimStake(), window);
    }

    function skipTime(uint256 seconds_) external {
        vm.warp(block.timestamp + bound(seconds_, 0, 7 days));
    }
}

/// @notice Accounting invariants across random action sequences.
contract LostAndFoundInvariantTest is Test {
    LostAndFound internal lf;
    Handler internal handler;
    address[] internal actors;

    function setUp() public {
        lf = new LostAndFound(
            address(this),
            address(this),
            address(this),
            MIN_REWARD,
            STAKE,
            WINDOW
        );
        for (uint256 i = 0; i < 4; ++i) {
            actors.push(makeAddr(string.concat("student", vm.toString(i))));
        }
        lf.verifyStudents(actors);
        handler = new Handler(lf, actors);
        // The handler acts as arbiter and admin (resolveDispute, setConfig).
        lf.grantRole(lf.ARBITER_ROLE(), address(handler));
        lf.grantRole(lf.DEFAULT_ADMIN_ROLE(), address(handler));
        targetContract(address(handler));
    }

    function invariant_SumOfBalancesEqualsTotalCredited() public view {
        uint256 sum;
        for (uint256 i = 0; i < actors.length; ++i) {
            sum += lf.balances(actors[i]);
        }
        assertEq(sum, lf.totalCredited());
    }

    function invariant_ContractIsSolvent() public view {
        assertGe(address(lf).balance, lf.totalEscrowed() + lf.totalCredited());
    }

    function invariant_EscrowMatchesOpenItems() public view {
        assertEq(lf.totalEscrowed(), handler.ghostEscrowed());
    }
}
