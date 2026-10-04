import type { Item, ItemStatus } from "@milgaya/shared";
import { getAddress } from "viem";
import { describe, expect, it } from "vitest";
import { planItemActions, viewerRole, withinWindow } from "../item-actions";

const OWNER = getAddress("0xc3094e09bb56e350bcdd9039ae2ce3e73d3900cf");
const FINDER = getAddress("0x3ba2113c559f36040366477d26e286ffae8928a1");
const OTHER = getAddress("0x0ecfe851ffdf16ae1e306ece7b24e6b64519c472");

function item(status: ItemStatus, claimed = status !== "Open"): Item {
  return {
    id: 7n,
    owner: OWNER,
    status,
    createdAt: 1_000n,
    finder: claimed ? FINDER : null,
    claimedAt: claimed ? 2_000n : null,
    claimWindow: claimed ? 300n : 0n,
    reward: 10n,
    stake: claimed ? 5n : 0n,
    metadataCID: "cid",
  };
}

const IN_WINDOW = 2_300n; // claimedAt + claimWindow, inclusive
const PASSED = 2_301n;

describe("viewerRole", () => {
  const verified = (wallet: `0x${string}`) => ({
    signedIn: true,
    linkedWallet: wallet,
    verifiedWallet: wallet,
  });

  it("tells owner, finder, student, unverified and guest apart", () => {
    const claimed = item("Claimed");
    expect(viewerRole(claimed, verified(OWNER))).toBe("owner");
    expect(viewerRole(claimed, verified(FINDER))).toBe("finder");
    expect(viewerRole(claimed, verified(OTHER))).toBe("student");
    expect(
      viewerRole(claimed, {
        signedIn: true,
        linkedWallet: OTHER,
        verifiedWallet: null,
      }),
    ).toBe("unverified");
    expect(
      viewerRole(claimed, {
        signedIn: true,
        linkedWallet: null,
        verifiedWallet: null,
      }),
    ).toBe("unverified");
    expect(
      viewerRole(claimed, {
        signedIn: false,
        linkedWallet: null,
        verifiedWallet: null,
      }),
    ).toBe("guest");
  });

  it("matches addresses in any case, and keeps the owner's role after a revoke", () => {
    expect(
      viewerRole(item("Open"), {
        signedIn: true,
        linkedWallet: OWNER.toLowerCase() as `0x${string}`,
        verifiedWallet: null,
      }),
    ).toBe("owner");
  });
});

describe("withinWindow", () => {
  it("is inclusive of the last second and unknown time counts as inside", () => {
    expect(withinWindow(item("Claimed"), IN_WINDOW)).toBe(true);
    expect(withinWindow(item("Claimed"), PASSED)).toBe(false);
    expect(withinWindow(item("Claimed"), null)).toBe(true);
  });
});

describe("planItemActions (UI_SPEC ActionBar matrix)", () => {
  const plan = (
    status: ItemStatus,
    role: Parameters<typeof planItemActions>[1],
    now: bigint | null = IN_WINDOW,
    balance = 0n,
  ) => planItemActions(item(status), role, now, balance);

  it("Open", () => {
    expect(plan("Open", "owner")).toEqual({ actions: ["cancel"], note: null });
    expect(plan("Open", "student")).toEqual({ actions: ["claim"], note: null });
    expect(plan("Open", "guest")).toEqual({ actions: [], note: "sign-in" });
    expect(plan("Open", "unverified")).toEqual({
      actions: [],
      note: "finish-setup",
    });
  });

  it("Claimed, in window", () => {
    expect(plan("Claimed", "owner").actions).toEqual([
      "confirm",
      "reject",
      "dispute",
    ]);
    expect(plan("Claimed", "finder").actions).toEqual(["dispute"]);
    expect(plan("Claimed", "student")).toEqual({
      actions: [],
      note: "claimed",
    });
    expect(plan("Claimed", "guest").note).toBe("claimed");
  });

  it("Claimed, window passed", () => {
    expect(plan("Claimed", "owner", PASSED).actions).toEqual(["confirm"]);
    expect(plan("Claimed", "finder", PASSED).actions).toEqual(["collect"]);
    expect(plan("Claimed", "unverified", PASSED).note).toBe("claimed");
  });

  it("Disputed", () => {
    expect(plan("Disputed", "owner")).toEqual({
      actions: [],
      note: "awaiting-arbiter",
    });
    expect(plan("Disputed", "finder").note).toBe("awaiting-arbiter");
    expect(plan("Disputed", "student").note).toBe("disputed");
  });

  it("Completed and Cancelled offer Withdraw only with a balance", () => {
    expect(plan("Completed", "finder", IN_WINDOW, 15n).actions).toEqual([
      "withdraw",
    ]);
    expect(plan("Completed", "owner", IN_WINDOW, 5n).actions).toEqual([
      "withdraw",
    ]);
    expect(plan("Completed", "finder")).toEqual({ actions: [], note: null });
    expect(plan("Completed", "student", IN_WINDOW, 5n).actions).toEqual([]);
    expect(plan("Cancelled", "owner", IN_WINDOW, 10n).actions).toEqual([
      "withdraw",
    ]);
    expect(plan("Cancelled", "student").note).toBe("cancelled");
  });
});
