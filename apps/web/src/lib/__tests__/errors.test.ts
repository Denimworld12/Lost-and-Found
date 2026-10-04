import { describe, expect, it } from "vitest";
import {
  isUserRejection,
  linkWalletErrorMessage,
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
