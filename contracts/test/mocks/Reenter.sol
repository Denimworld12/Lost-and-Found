// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {LostAndFound} from "../../contracts/LostAndFound.sol";

/// @notice Test-only malicious receiver. It gets a balance credited in LostAndFound, then calls
/// `withdraw()` and tries to call `withdraw()` again from its `receive()`.
contract Reenter {
    LostAndFound public immutable target;

    /// @dev When true, `receive()` catches the failed re-entry so the outer withdraw can finish.
    bool public swallowReentryFailure;
    /// @dev When true, `receive()` reverts outright, so the ETH transfer itself fails.
    bool public rejectPayments;

    bool public reentryAttempted;
    bool public reentrySucceeded;
    uint256 public balanceSeenDuringReceive;
    uint256 public receivedTotal;
    bytes public reentryError;

    constructor(LostAndFound target_) {
        target = target_;
    }

    function setMode(bool swallow, bool reject) external {
        swallowReentryFailure = swallow;
        rejectPayments = reject;
    }

    function post(string calldata cid) external payable returns (uint256) {
        return target.postItem{value: msg.value}(cid);
    }

    function cancel(uint256 id) external {
        target.cancelItem(id);
    }

    function attack() external {
        target.withdraw();
    }

    receive() external payable {
        if (rejectPayments) revert("payments rejected");
        receivedTotal += msg.value;
        balanceSeenDuringReceive = target.balances(address(this));
        reentryAttempted = true;
        if (swallowReentryFailure) {
            try target.withdraw() {
                reentrySucceeded = true;
            } catch (bytes memory reason) {
                reentryError = reason;
            }
        } else {
            target.withdraw();
            reentrySucceeded = true;
        }
    }
}
