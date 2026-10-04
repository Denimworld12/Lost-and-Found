import { getAddress, zeroAddress } from "viem";
import { describe, expect, it } from "vitest";
import { statusFromIndex, toItem } from "../contract";

describe("toItem", () => {
  const raw = {
    owner: "0x4b00000000000000000000000000000000091afa" as const,
    status: 1,
    createdAt: 100n,
    finder: zeroAddress,
    claimedAt: 0n,
    claimWindow: 0,
    reward: 10n ** 15n,
    stake: 0n,
    metadataCID: "bafy",
  };

  it("maps an unclaimed item with null finder fields", () => {
    expect(toItem(1n, raw)).toMatchObject({
      id: 1n,
      status: "Open",
      finder: null,
      claimedAt: null,
      claimWindow: 0n,
    });
  });

  it("checksums addresses and keeps the per-item claim window", () => {
    const item = toItem(2n, {
      ...raw,
      status: 2,
      finder: "0x9c00000000000000000000000000000000002210",
      claimedAt: 500n,
      claimWindow: 300,
      stake: 5n,
    });
    expect(item).toMatchObject({
      status: "Claimed",
      claimedAt: 500n,
      claimWindow: 300n,
      stake: 5n,
    });
    expect(item.owner).toBe(getAddress(raw.owner));
    expect(item.owner).not.toBe(raw.owner);
  });
});

describe("statusFromIndex", () => {
  it("follows the contract enum order", () => {
    expect([1, 2, 3, 4, 5].map(statusFromIndex)).toEqual([
      "Open",
      "Claimed",
      "Disputed",
      "Completed",
      "Cancelled",
    ]);
  });

  it("rejects None and unknown values", () => {
    expect(() => statusFromIndex(0)).toThrow();
    expect(() => statusFromIndex(6)).toThrow();
  });
});
