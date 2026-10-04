import { getAddress } from "viem";
import { describe, expect, it } from "vitest";
import {
  fromUserJson,
  getLinkedWallet,
  primaryVerifiedEmail,
  verifiedWallets,
  type ClerkUserLike,
} from "../clerk-user";

const A = "0xc3094e09bb56e350bcdd9039ae2ce3e73d3900cf";
const B = "0x3ba2113c559f36040366477d26e286ffae8928a1";
const verified = { status: "verified" };
const unverified = { status: "unverified" };

function user(overrides: Partial<ClerkUserLike> = {}): ClerkUserLike {
  return {
    id: "user_1",
    primaryEmailAddressId: "email_1",
    emailAddresses: [
      {
        id: "email_1",
        emailAddress: "Riya@College.edu.in",
        verification: verified,
      },
      { id: "email_2", emailAddress: "riya@gmail.com", verification: verified },
    ],
    web3Wallets: [],
    publicMetadata: {},
    ...overrides,
  };
}

describe("primaryVerifiedEmail", () => {
  it("returns the primary address, lowercased", () => {
    expect(primaryVerifiedEmail(user())).toBe("riya@college.edu.in");
  });

  it("ignores an unverified primary address and never falls back to another one", () => {
    expect(
      primaryVerifiedEmail(
        user({
          emailAddresses: [
            {
              id: "email_1",
              emailAddress: "riya@college.edu.in",
              verification: unverified,
            },
            {
              id: "email_2",
              emailAddress: "riya@gmail.com",
              verification: verified,
            },
          ],
        }),
      ),
    ).toBeNull();
    expect(
      primaryVerifiedEmail(user({ primaryEmailAddressId: null })),
    ).toBeNull();
  });
});

describe("getLinkedWallet", () => {
  it("returns the single verified wallet, checksummed", () => {
    const linked = getLinkedWallet(
      user({ web3Wallets: [{ web3Wallet: A, verification: verified }] }),
    );
    expect(linked).toBe(getAddress(A));
  });

  it("ignores unverified wallets", () => {
    const u = user({
      web3Wallets: [
        { web3Wallet: A, verification: unverified },
        { web3Wallet: B, verification: verified },
      ],
    });
    expect(getLinkedWallet(u)?.toLowerCase()).toBe(B);
  });

  it("returns null with no wallet or with more than one verified wallet", () => {
    expect(getLinkedWallet(user())).toBeNull();
    const two = user({
      web3Wallets: [
        { web3Wallet: A, verification: verified },
        { web3Wallet: B, verification: verified },
      ],
    });
    expect(getLinkedWallet(two)).toBeNull();
    expect(verifiedWallets(two)).toHaveLength(2);
  });

  it("skips values that aren't Ethereum addresses", () => {
    expect(
      getLinkedWallet(
        user({
          web3Wallets: [{ web3Wallet: "solana-key", verification: verified }],
        }),
      ),
    ).toBeNull();
  });
});

describe("fromUserJson", () => {
  it("maps a webhook payload to the backend user shape", () => {
    const mapped = fromUserJson({
      id: "user_2",
      primary_email_address_id: "e1",
      email_addresses: [
        { id: "e1", email_address: "a@college.edu.in", verification: verified },
      ],
      web3_wallets: [{ web3_wallet: A, verification: verified }],
      public_metadata: { role: "student" },
    });
    expect(primaryVerifiedEmail(mapped)).toBe("a@college.edu.in");
    expect(getLinkedWallet(mapped)?.toLowerCase()).toBe(A);
    expect(mapped.publicMetadata).toEqual({ role: "student" });
  });
});
