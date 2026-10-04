import type { Item } from "@clf/shared";
import { withinWindow } from "./item-actions";

/** What a "Needs your action" row asks for (docs/UI_SPEC.md → My dashboard). */
export type NeedKind = "respond" | "collect" | "withdraw" | "dispute";

export interface Need {
  kind: NeedKind;
  /** Absent for `withdraw`, which is about the whole balance. */
  item?: Item;
}

const KIND_ORDER: Record<NeedKind, number> = {
  respond: 0,
  collect: 1,
  withdraw: 2,
  dispute: 3,
};

/**
 * Claimed items you own (respond), your claims past the window (collect), a withdrawable
 * balance (withdraw), and disputes involving you (status only). Newest item first per kind.
 */
export function needsAction(
  lost: readonly Item[],
  found: readonly Item[],
  chainNow: bigint | null,
  withdrawable: bigint,
): Need[] {
  const needs: Need[] = [];
  for (const item of lost) {
    if (item.status === "Claimed") needs.push({ kind: "respond", item });
    if (item.status === "Disputed") needs.push({ kind: "dispute", item });
  }
  for (const item of found) {
    // Chain time unknown: don't offer a collect the contract would refuse.
    if (
      item.status === "Claimed" &&
      chainNow !== null &&
      !withinWindow(item, chainNow)
    )
      needs.push({ kind: "collect", item });
    if (item.status === "Disputed") needs.push({ kind: "dispute", item });
  }
  if (withdrawable > 0n) needs.push({ kind: "withdraw" });
  return needs.sort(
    (a, b) =>
      KIND_ORDER[a.kind] - KIND_ORDER[b.kind] ||
      Number((b.item?.id ?? 0n) - (a.item?.id ?? 0n)),
  );
}

/** Items still in play first (Claimed, Disputed, Open), then finished ones; newest first within each. */
export function sortForDashboard(items: readonly Item[]): Item[] {
  const rank = (item: Item) =>
    item.status === "Claimed" || item.status === "Disputed"
      ? 0
      : item.status === "Open"
        ? 1
        : 2;
  return [...items].sort(
    (a, b) => rank(a) - rank(b) || (a.id > b.id ? -1 : a.id < b.id ? 1 : 0),
  );
}
