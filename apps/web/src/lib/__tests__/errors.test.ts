import { describe, expect, it } from "vitest";
import {
  describeTxError,
  INSUFFICIENT_FUNDS_MESSAGE,
  isUserRejection,
  linkWalletErrorMessage,
  revertErrorName,
  USER_REJECTED_MESSAGE,
  WALLET_TAKEN_MESSAGE,
} from "../errors";

describe("isUserRejection", () => {
  it("spots MetaMask's rejection directly or as a cause", () => {
    expect(isUserRejection({ code: 4001 })).toBe(true);
    expect(isUserRejection({ name: "UserRejectedRequestError" })).toBe(true);
    expect(
      isUserRejection(new Error("x", { cause: { cause: { code: 4001 } } })),
    ).toBe(true);
    expect(isUserRejection(new Error("nonce too low"))).toBe(false);
    expect(isUserRejection(null)).toBe(false);
  });
});

describe("linkWalletErrorMessage", () => {
  it("explains a wallet that belongs to another account", () => {
    expect(
      linkWalletErrorMessage({
        clerkError: true,
        errors: [{ code: "form_identifier_exists" }],
      }),
    ).toBe(WALLET_TAKEN_MESSAGE);
  });

  it("falls back to Clerk's message, then a generic one", () => {
    expect(
      linkWalletErrorMessage({
        errors: [{ code: "x", longMessage: "Web3 is disabled." }],
      }),
    ).toBe("Web3 is disabled.");
    expect(linkWalletErrorMessage(new Error("boom"))).toBe(
      "We couldn't link your wallet. Try again.",
    );
  });
});

describe("describeTxError", () => {
  const revertOf = (errorName: string) => ({
    name: "ContractFunctionExecutionError",
    cause: {
      name: "ContractFunctionRevertedError",
      data: { errorName, args: [] },
    },
  });

  it("has copy for every custom error in PLAN.md's table", () => {
    const expected: Record<string, string> = {
      NotVerified: "Finish activating your account before posting or claiming.",
      NotOwner: "Only the person who posted this item can do that.",
      NotFinder: "Only the student who claimed this item can do that.",
      NotParty: "Only the owner or finder can raise a dispute.",
      WrongStatus: "This item changed status. Refresh to see the latest.",
      WrongStake: "The claim deposit changed. Refresh and try again.",
      OwnerCannotClaim: "You can't claim your own item.",
      WindowClosed: "The response window has ended for this claim.",
      NothingToWithdraw: "You have no funds to withdraw.",
      EnforcedPause: "Posting and claiming are paused by the admins right now.",
    };
    for (const [errorName, message] of Object.entries(expected)) {
      expect(describeTxError(revertOf(errorName))).toEqual({
        kind: "contract",
        errorName,
        message,
      });
    }
  });

  it("fills in the minimum reward and the window end", () => {
    expect(
      describeTxError(revertOf("RewardTooLow"), {
        minReward: 1_000_000_000_000_000n,
      }).message,
    ).toBe("The reward must be at least 0.001 ETH.");
    expect(describeTxError(revertOf("WindowOpen"), {}).message).toBe(
      "You can collect once the response window ends if the owner hasn't responded.",
    );
    expect(
      describeTxError(revertOf("WindowOpen"), { windowEndsAt: 1_791_100_000n })
        .message,
    ).toMatch(
      /^You can collect after \d+ \w+, \d\d:\d\d if the owner hasn't responded\.$/,
    );
  });

  it("separates rejections, insufficient funds and unknown failures", () => {
    expect(describeTxError({ code: 4001 })).toEqual({
      kind: "rejected",
      message: USER_REJECTED_MESSAGE,
    });
    expect(
      describeTxError(
        new Error("x", {
          cause: { details: "insufficient funds for gas * price + value" },
        }),
      ),
    ).toEqual({ kind: "funds", message: INSUFFICIENT_FUNDS_MESSAGE });
    expect(describeTxError(revertOf("SomethingNew")).kind).toBe("contract");
    expect(
      describeTxError({ name: "ContractFunctionRevertedError" }).message,
    ).toBe("This transaction would fail. Refresh the page and try again.");
    expect(describeTxError(new Error("fetch failed")).kind).toBe("unknown");
  });

  it("finds the error name however deep viem nests it", () => {
    expect(revertErrorName({ cause: { cause: revertOf("NotOwner") } })).toBe(
      "NotOwner",
    );
    expect(revertErrorName(new Error("plain"))).toBeUndefined();
  });
});
