import type { Item, ItemStatus } from "@clf/shared";
import { describe, expect, it } from "vitest";
import { needsAction, sortForDashboard } from "../dashboard";

const ME = "0x00000000000000000000000000000000000000aa" as const;
const THEM = "0x00000000000000000000000000000000000000bb" as const;

function item(id: number, status: ItemStatus, mine: "owner" | "finder"): Item {
  const claimed = status !== "Open" && status !== "Cancelled";
  return {
    id: BigInt(id),
    owner: mine === "owner" ? ME : THEM,
    status,
    createdAt: 1_000n,
    finder: claimed ? (mine === "finder" ? ME : THEM) : null,
    claimedAt: claimed ? 2_000n : null,
    claimWindow: claimed ? 300n : 0n,
    reward: 10n,
    stake: 5n,
    metadataCID: "cid",
  };
}

describe("needsAction", () => {
  const lost = [
    item(1, "Claimed", "owner"),
    item(2, "Open", "owner"),
    item(3, "Disputed", "owner"),
    item(9, "Claimed", "owner"),
  ];
  const found = [item(4, "Claimed", "finder"), item(5, "Completed", "finder")];

  it("lists responses, collects, the balance and disputes in that order", () => {
    const needs = needsAction(lost, found, 2_301n, 15n);
    expect(needs.map((need) => [need.kind, need.item?.id])).toEqual([
      ["respond", 9n],
      ["respond", 1n],
      ["collect", 4n],
      ["withdraw", undefined],
      ["dispute", 3n],
    ]);
  });

  it("offers a collect only after the window, measured in chain time", () => {
    expect(needsAction([], found, 2_300n, 0n)).toEqual([]);
    expect(needsAction([], found, null, 0n)).toEqual([]);
  });

  it("is empty when nothing needs the student", () => {
    expect(needsAction([item(2, "Open", "owner")], [], 2_000n, 0n)).toEqual([]);
  });
});

describe("sortForDashboard", () => {
  it("puts items in play first, then open, then finished; newest first", () => {
    const sorted = sortForDashboard([
      item(1, "Completed", "owner"),
      item(2, "Open", "owner"),
      item(3, "Claimed", "owner"),
      item(4, "Open", "owner"),
      item(5, "Cancelled", "owner"),
    ]);
    expect(sorted.map((i) => i.id)).toEqual([3n, 4n, 2n, 5n, 1n]);
  });
});
