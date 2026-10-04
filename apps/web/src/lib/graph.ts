import type { Item, ItemStatus } from "@clf/shared";
import { isAddressEqual, type Address } from "viem";
import {
  getPublicClient,
  readItemCount,
  readItems,
  scanEvents,
  type ContractEvent,
} from "./contract";

/**
 * Item queries for the app. Callers use only these functions, so the data source can change
 * underneath them.
 *
 * Today every query reads the contract directly (`itemCount` + `getItem` via multicall,
 * latest 50 items): the subgraph (PLAN.md Phase 5) isn't deployed yet. When it is, the
 * subgraph becomes the primary source here and this path stays as the fallback for when it
 * errors or lags. See docs/DECISIONS.md.
 */

/** How many of the newest items the direct-from-chain path reads. */
export const CHAIN_FALLBACK_LIMIT = 50;

export type DataSource = "subgraph" | "chain";

export type ItemSort = "newest" | "reward";

export interface ItemFilters {
  /** `undefined` means every status. */
  status?: ItemStatus;
  sort?: ItemSort;
}

export interface ItemPage {
  items: Item[];
  /** Pass to `getItems` for the next page; `null` when there are no more. */
  nextCursor: string | null;
  /** `"chain"` means only the latest {@link CHAIN_FALLBACK_LIMIT} items were read. */
  source: DataSource;
  /** Items ever posted (`itemCount`). */
  totalPosted: bigint;
}

async function latestItems(): Promise<{ items: Item[]; totalPosted: bigint }> {
  const client = getPublicClient();
  const totalPosted = await readItemCount(client);
  const ids: bigint[] = [];
  for (
    let id = totalPosted;
    id >= 1n && ids.length < CHAIN_FALLBACK_LIMIT;
    id--
  )
    ids.push(id);
  return { items: await readItems(ids, client), totalPosted };
}

function sortItems(items: Item[], sort: ItemSort): Item[] {
  return [...items].sort((a, b) => {
    if (sort === "reward" && a.reward !== b.reward)
      return a.reward > b.reward ? -1 : 1;
    return a.id > b.id ? -1 : a.id < b.id ? 1 : 0;
  });
}

/**
 * Items matching the filters, newest first or by highest reward. Category and title search
 * need the IPFS metadata, so callers apply those after it loads.
 */
export async function getItems(
  filters: ItemFilters = {},
  cursor?: string | null,
): Promise<ItemPage> {
  void cursor; // The chain path returns a single page.
  const { items, totalPosted } = await latestItems();
  const filtered = filters.status
    ? items.filter((item) => item.status === filters.status)
    : items;
  return {
    items: sortItems(filtered, filters.sort ?? "newest"),
    nextCursor: null,
    source: "chain",
    totalPosted,
  };
}

export type ItemEventKind =
  | "Posted"
  | "Claimed"
  | "Confirmed"
  | "Rejected"
  | "Disputed"
  | "Resolved"
  | "TimeoutClaimed"
  | "Cancelled";

/** One step in an item's history (the subgraph's `ItemEvent`). */
export interface ItemEvent {
  kind: ItemEventKind;
  actor: Address | null;
  amount: bigint | null;
  /** For `Resolved`: whether the arbiter paid the finder. */
  finderWins?: boolean;
  txHash: `0x${string}`;
  /** Seconds; `null` if the block time couldn't be read. */
  timestamp: bigint | null;
}

const ITEM_EVENT_KINDS: Partial<Record<ContractEvent["name"], ItemEventKind>> =
  {
    ItemPosted: "Posted",
    ItemClaimed: "Claimed",
    ReturnConfirmed: "Confirmed",
    ClaimRejected: "Rejected",
    DisputeRaised: "Disputed",
    DisputeResolved: "Resolved",
    TimeoutClaimed: "TimeoutClaimed",
    ItemCancelled: "Cancelled",
  };

export function toItemEvent(event: ContractEvent): ItemEvent | null {
  const kind = ITEM_EVENT_KINDS[event.name];
  if (!kind) return null;
  const args = event.args;
  const actor = (args.owner ??
    args.finder ??
    args.by ??
    args.arbiter ??
    null) as Address | null;
  const amount = (args.reward ??
    args.stake ??
    args.amount ??
    args.stakeToOwner ??
    null) as bigint | null;
  return {
    kind,
    actor,
    amount,
    finderWins:
      typeof args.finderWins === "boolean" ? args.finderWins : undefined,
    txHash: event.txHash,
    timestamp: event.timestamp,
  };
}

export interface ItemHistory {
  /** Newest first. */
  events: ItemEvent[];
  /** False when the RPC couldn't reach back to the item's `ItemPosted` event. */
  complete: boolean;
}

/** One item, or `null` if the ID doesn't exist. */
export async function getItem(id: bigint): Promise<Item | null> {
  if (id < 1n) return null;
  const [item] = await readItems([id]);
  return item ?? null;
}

/** An item's event history, newest first. */
export async function getItemHistory(id: bigint): Promise<ItemHistory> {
  const { events, complete } = await scanEvents({
    limit: 100,
    filter: (event) => event.itemId === id && event.name in ITEM_EVENT_KINDS,
    stopAt: (event) => event.name === "ItemPosted",
  });
  return {
    events: events
      .map(toItemEvent)
      .filter((event): event is ItemEvent => event !== null),
    complete,
  };
}

/** Items the address posted or claimed, newest first. */
export async function getItemsByUser(
  address: Address,
): Promise<{ lost: Item[]; found: Item[]; source: DataSource }> {
  const { items } = await latestItems();
  return {
    lost: items.filter((item) => isAddressEqual(item.owner, address)),
    found: items.filter(
      (item) => item.finder !== null && isAddressEqual(item.finder, address),
    ),
    source: "chain",
  };
}

/** One row in a student's dashboard history: an item event or a withdrawal. */
export interface UserActivity {
  kind: ItemEventKind | "Withdrawn";
  itemId: bigint | null;
  actor: Address | null;
  amount: bigint | null;
  finderWins?: boolean;
  txHash: `0x${string}`;
  timestamp: bigint | null;
}

/**
 * Contract events involving `address`, newest first: events it sent or received (owner,
 * finder, disputer, withdrawal) and events on items it posted or claimed (`itemIds`).
 */
export async function getUserHistory(
  address: Address,
  itemIds: readonly bigint[],
  limit = 50,
): Promise<{ events: UserActivity[]; complete: boolean }> {
  const ids = new Set(itemIds.map((id) => id.toString()));
  const involves = (event: ContractEvent) => {
    if (event.itemId !== null && ids.has(event.itemId.toString())) return true;
    return ["owner", "finder", "by", "to"].some((key) => {
      const value = event.args[key];
      return (
        typeof value === "string" && isAddressEqual(value as Address, address)
      );
    });
  };
  const { events, complete } = await scanEvents({
    limit,
    filter: (event) =>
      (event.name in ITEM_EVENT_KINDS || event.name === "Withdrawn") &&
      involves(event),
  });
  return {
    events: events.map((event) => {
      if (event.name === "Withdrawn") {
        return {
          kind: "Withdrawn",
          itemId: null,
          actor: (event.args.to as Address | undefined) ?? null,
          amount: (event.args.amount as bigint | undefined) ?? null,
          txHash: event.txHash,
          timestamp: event.timestamp,
        };
      }
      const itemEvent = toItemEvent(event)!;
      return { ...itemEvent, itemId: event.itemId };
    }),
    complete,
  };
}

export interface Stats {
  itemsPosted: bigint;
  itemsReturned: bigint;
  totalRewardsPaid: bigint;
  openItems: bigint;
  source: DataSource;
  /** True when the totals cover only the latest {@link CHAIN_FALLBACK_LIMIT} items. */
  partial: boolean;
}

/** Totals for the home trust strip and the transparency page (the subgraph's `Stats`). */
export async function getStats(): Promise<Stats> {
  const { items, totalPosted } = await latestItems();
  let itemsReturned = 0n;
  let totalRewardsPaid = 0n;
  let openItems = 0n;
  for (const item of items) {
    if (item.status === "Completed") {
      itemsReturned++;
      totalRewardsPaid += item.reward;
    }
    if (item.status === "Open") openItems++;
  }
  return {
    itemsPosted: totalPosted,
    itemsReturned,
    totalRewardsPaid,
    openItems,
    source: "chain",
    partial: totalPosted > BigInt(items.length),
  };
}

/** The latest contract events of any kind, newest first (transparency page). */
export async function getRecentEvents(
  limit = 20,
): Promise<{ events: ContractEvent[]; complete: boolean }> {
  return scanEvents({ limit });
}
