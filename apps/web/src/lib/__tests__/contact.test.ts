import type { Item } from "@milgaya/shared";
import { describe, expect, it } from "vitest";
import { contactCounterparty } from "../contact";

const OWNER = "0xc3094e09bB56E350bCDd9039aE2ce3E73D3900cF";
const FINDER = "0x3BA2113c559F36040366477d26E286FFaE8928A1";
const OTHER = "0x9FF4CD7D8DaF39334b469D7C009e5BC4830B6947";

const item = (overrides: Partial<Item> = {}): Item => ({
  id: 1n,
  owner: OWNER,
  status: "Claimed",
  createdAt: 1n,
  finder: FINDER,
  claimedAt: 2n,
  claimWindow: 300n,
  reward: 10n ** 16n,
  stake: 5n * 10n ** 14n,
  metadataCID: "bafy",
  ...overrides,
});

describe("contactCounterparty", () => {
  it("shows the owner the finder and the finder the owner", () => {
    expect(contactCounterparty(item(), OWNER)).toBe(FINDER);
    expect(contactCounterparty(item(), FINDER)).toBe(OWNER);
  });

  it("compares addresses regardless of case", () => {
    expect(
      contactCounterparty(item(), OWNER.toLowerCase() as `0x${string}`),
    ).toBe(FINDER);
  });

  it("allows Claimed, Disputed and Completed only", () => {
    for (const status of ["Disputed", "Completed"] as const) {
      expect(contactCounterparty(item({ status }), OWNER)).toBe(FINDER);
    }
    for (const status of ["Open", "Cancelled"] as const) {
      expect(() => contactCounterparty(item({ status }), OWNER)).toThrow(
        /claimed/,
      );
    }
    expect(() => contactCounterparty(item({ finder: null }), OWNER)).toThrow();
  });

  it("refuses anyone who isn't a party", () => {
    expect(() => contactCounterparty(item(), OTHER)).toThrowError(
      expect.objectContaining({ status: 403, code: "FORBIDDEN" }),
    );
  });
});
