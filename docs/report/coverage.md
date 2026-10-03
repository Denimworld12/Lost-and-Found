# Test coverage

Run `pnpm --filter contracts coverage`. It runs the TypeScript tests (`contracts/test/`) and the Solidity fuzz and
invariant tests (`contracts/test-sol/`) with coverage on, writes `contracts/coverage/` (HTML + `lcov.info`), and
fails unless every line of `LostAndFound.sol` is covered.

## Result

| File                         | Lines          | Statements |
| ---------------------------- | -------------- | ---------- |
| `contracts/LostAndFound.sol` | 100% (139/139) | 100%       |

83 tests: 75 TypeScript (node:test + viem), 5 fuzz tests (1,024 runs each) and 3 invariants (256 runs, depth 64).

## Branches

Hardhat 3's built-in coverage reports lines and statements, not branches. Every branch in `LostAndFound.sol` is
an `if (...) revert` guard, the `finderWins` if/else, or a short-circuit `||`/`&&`. A covered revert statement
proves the "true" side ran; a covered statement after the guard proves the "false" side ran. Each operand of the
compound conditions has its own test. The table maps every branch to a test.

| Function / modifier                  | Branch                                                                                                                       | Test                                                                                                            |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| constructor                          | `admin`, `verifier`, `arbiter` zero (each) → `ZeroAddress`                                                                   | deployment › reverts on zero addresses                                                                          |
| `_setConfig`                         | `minReward` 0 / > uint128, `claimStake` 0 / > uint128, window < 5 min / > 14 days → `InvalidConfig`; exact bounds accepted   | deployment › reverts on bad config, accepts config exactly at the bounds; config › rejects out-of-bounds config |
| `onlyVerified`                       | unverified → `NotVerified`                                                                                                   | postItem / claimItem › reverts for unverified callers                                                           |
| `itemExists`                         | id 0, id > `itemCount` → `ItemNotFound`                                                                                      | views › getItem reverts for unknown IDs, "reverts for an unknown item" in each flow                             |
| `whenNotPaused`                      | paused → `EnforcedPause`                                                                                                     | postItem / claimItem › reverts while paused                                                                     |
| `postItem`                           | below `minReward`, above uint128, empty CID, 101-byte CID, success at 1/100 bytes and at exactly `minReward`                 | postItem › all cases; fuzz `testFuzz_PostItemReward`                                                            |
| `claimItem`                          | not Open, owner claims, wrong deposit (0, −1, +1), success                                                                   | claimItem › all cases; fuzz `testFuzz_ClaimItemStake`                                                           |
| `confirmReturn`                      | not owner, not Claimed, success (in and after window)                                                                        | confirmReturn › all cases                                                                                       |
| `rejectClaim`                        | not owner, not Claimed, window closed, success at the edge, re-claim after                                                   | rejectClaim › all cases; fuzz `testFuzz_RejectClaimEdge`                                                        |
| `raiseDispute`                       | not party, not Claimed, window closed, owner, finder                                                                         | raiseDispute › all cases                                                                                        |
| `claimAfterTimeout`                  | not finder, not Claimed, before window, exactly at edge, one second after                                                    | claimAfterTimeout › all cases; fuzz `testFuzz_ClaimAfterTimeoutEdge`                                            |
| `resolveDispute`                     | not arbiter, not Disputed, finder wins, owner wins (reopens)                                                                 | resolveDispute › all cases                                                                                      |
| `cancelItem`                         | not owner, not Open, success, works while paused                                                                             | cancelItem › all cases                                                                                          |
| `withdraw`                           | nothing to withdraw, success, receiver rejects ETH → `TransferFailed`, re-entry blocked by guard, balance zeroed before send | withdraw › all cases (uses `test/mocks/Reenter.sol`)                                                            |
| `verifyStudent(s)` / `revokeStudent` | not verifier, zero address (single and in batch), success, empty batch                                                       | student verification › all cases                                                                                |
| `setConfig` / `pause` / `unpause`    | not admin, success, events                                                                                                   | config and pause › all cases                                                                                    |
| `withinWindow`                       | true through the edge, false after                                                                                           | views › withinWindow…; fuzz edge tests                                                                          |
| `receive` / `fallback`               | plain ETH, unknown selector with and without ETH                                                                             | direct payments › all cases                                                                                     |

## Mutation check

These single-character changes to `LostAndFound.sol` were each tried once and each made at least one test fail
(then reverted): `<=` → `<` in the window check; `>` → `>=` on the CID length; dropping the `claimStake_ == 0`
check; moving the max window by one second; letting only the owner dispute; not zeroing the balance before the
send in `withdraw`; dropping the `verifier` zero-address check.
