import type { Item, ItemStatus } from "@milgaya/shared";
import { getAddress, isAddressEqual, type Address } from "viem";
import { z } from "zod";
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
 * When `NEXT_PUBLIC_SUBGRAPH_URL` is set, the subgraph (PLAN.md Phase 5) is the primary
 * source. Each query falls back to reading the contract directly (`itemCount` + `getItem`
 * via multicall, latest 50 items, or `eth_getLogs` for history) when the subgraph errors or
 * its indexed block is more than {@link SUBGRAPH_MAX_LAG} blocks behind the chain head, or
 * behind the receipt block of this tab's latest write ({@link awaitSubgraphBlock}).
 * Without the variable (local development) only the contract path runs. See
 * docs/DECISIONS.md.
 */

/** How many of the newest items the direct-from-chain path reads. */
export const CHAIN_FALLBACK_LIMIT = 50;

/** Blocks the subgraph may trail the chain head before queries fall back to the contract. */
export const SUBGRAPH_MAX_LAG = 50n;

/** Items per `getItems` page from the subgraph. */
export const SUBGRAPH_PAGE_SIZE = 100;

/** The Graph's largest `first`; the cap for a student's own items. */
const SUBGRAPH_MAX_FIRST = 1000;

/** Item events read for one item's history (same cap as the `eth_getLogs` path). */
const HISTORY_LIMIT = 100;

const SUBGRAPH_TIMEOUT_MS = 8_000;

// ─────────────────────────────────────────────────────────────── Subgraph

/** Read per call (not at import) so the inlined `NEXT_PUBLIC_` value and tests both work. */
function subgraphUrl(): string | null {
  return process.env.NEXT_PUBLIC_SUBGRAPH_URL?.trim() || null;
}

class SubgraphUnavailable extends Error {}

/**
 * Receipt block of this tab's latest confirmed write that the subgraph hasn't indexed yet.
 * While set, subgraph answers older than it are skipped for the contract, and the views
 * show "Syncing…".
 */
let syncBlock: bigint | null = null;
const syncListeners = new Set<() => void>();

function setSyncBlock(block: bigint | null) {
  syncBlock = block;
  for (const listener of syncListeners) listener();
}

/** Call with a confirmed write's receipt block: reads come from the contract until the subgraph reaches it. */
export function awaitSubgraphBlock(block: bigint) {
  if (!subgraphUrl() || (syncBlock !== null && syncBlock >= block)) return;
  setSyncBlock(block);
}

/** True while the subgraph hasn't indexed this tab's latest write. */
export function isSubgraphSyncing(): boolean {
  return syncBlock !== null;
}

export function subscribeSubgraphSync(listener: () => void): () => void {
  syncListeners.add(listener);
  return () => syncListeners.delete(listener);
}

const bigintString = z
  .string()
  .regex(/^-?\d+$/)
  .transform((value) => BigInt(value));
const hexAddress = z
  .string()
  .regex(/^0x[0-9a-fA-F]{40}$/)
  .transform((value) => getAddress(value));
const txHash = z
  .string()
  .regex(/^0x[0-9a-fA-F]{64}$/)
  .transform((value) => value.toLowerCase() as `0x${string}`);

const metaSchema = z.object({
  block: z.object({ number: z.number().int().nonnegative() }),
});

const subgraphItemSchema = z.object({
  itemId: bigintString,
  owner: hexAddress,
  finder: hexAddress.nullable(),
  reward: bigintString,
  stake: bigintString,
  metadataCID: z.string(),
  status: z.enum(["Open", "Claimed", "Disputed", "Completed", "Cancelled"]),
  createdAt: bigintString,
  claimedAt: bigintString.nullable(),
  claimWindow: bigintString,
});

const subgraphStatsSchema = z.object({
  itemsPosted: bigintString,
  itemsReturned: bigintString,
  totalRewardsPaid: bigintString,
  openItems: bigintString,
});

const subgraphEventSchema = z.object({
  kind: z.enum([
    "Posted",
    "Claimed",
    "Confirmed",
    "Rejected",
    "Disputed",
    "Resolved",
    "TimeoutClaimed",
    "Cancelled",
  ]),
  actor: hexAddress,
  amount: bigintString.nullable(),
  finderWins: z.boolean().nullable(),
  txHash,
  timestamp: bigintString,
});

const ITEM_FIELDS =
  "itemId owner finder reward stake metadataCID status createdAt claimedAt claimWindow";

function fromSubgraphItem(raw: z.output<typeof subgraphItemSchema>): Item {
  return {
    id: raw.itemId,
    owner: raw.owner,
    status: raw.status,
    createdAt: raw.createdAt,
    finder: raw.finder,
    claimedAt: raw.claimedAt,
    claimWindow: raw.claimWindow,
    reward: raw.reward,
    stake: raw.stake,
    metadataCID: raw.metadataCID,
  };
}

/**
 * Runs `query` (which must select `_meta { block { number } }`) and parses `data` with
 * `schema`. Throws {@link SubgraphUnavailable} on a network, GraphQL or shape error, or when
 * the indexed block trails the chain head by more than {@link SUBGRAPH_MAX_LAG}.
 */
async function querySubgraph<T extends z.ZodType>(
  url: string,
  query: string,
  variables: Record<string, unknown>,
  schema: T,
): Promise<z.output<T>> {
  const [body, head] = await Promise.all([
    fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query, variables }),
      signal: AbortSignal.timeout(SUBGRAPH_TIMEOUT_MS),
    }).then(async (response) => {
      if (!response.ok)
        throw new SubgraphUnavailable(`Subgraph HTTP ${response.status}`);
      return (await response.json()) as { data?: unknown; errors?: unknown };
    }),
    // If the head can't be read, the contract path would fail too: trust the subgraph.
    getPublicClient()
      .getBlockNumber()
      .catch(() => null),
  ]);
  if (body.errors) throw new SubgraphUnavailable("Subgraph query error");
  const parsed = schema.safeParse(body.data);
  if (!parsed.success)
    throw new SubgraphUnavailable("Unexpected subgraph response");
  const meta = metaSchema.safeParse((body.data as { _meta?: unknown })._meta);
  if (!meta.success) throw new SubgraphUnavailable("Subgraph _meta missing");
  const indexed = BigInt(meta.data.block.number);
  if (head !== null && head - indexed > SUBGRAPH_MAX_LAG)
    throw new SubgraphUnavailable("Subgraph is behind the chain");
  if (syncBlock !== null) {
    if (indexed < syncBlock)
      throw new SubgraphUnavailable("Subgraph hasn't indexed the latest write");
    setSyncBlock(null);
  }
  return parsed.data;
}

/**
 * Runs the subgraph query when a subgraph is configured, and the contract read when it isn't
 * or when the subgraph query throws (error or lag).
 */
async function withFallback<T>(
  fromSubgraph: (url: string) => Promise<T>,
  fromChain: () => Promise<T>,
): Promise<T> {
  const url = subgraphUrl();
  if (!url) return fromChain();
  try {
    return await fromSubgraph(url);
  } catch {
    return fromChain();
  }
}

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
  return withFallback(
    (url) => subgraphItems(url, filters, cursor),
    () => chainItems(filters),
  );
}

const itemsPageSchema = z.object({
  items: z.array(subgraphItemSchema),
  stats: subgraphStatsSchema.pick({ itemsPosted: true }).nullable(),
});

async function subgraphItems(
  url: string,
  filters: ItemFilters,
  cursor?: string | null,
): Promise<ItemPage> {
  const skip = cursor && /^\d+$/.test(cursor) ? Number(cursor) : 0;
  const sort = filters.sort ?? "newest";
  const data = await querySubgraph(
    url,
    `query Items($first: Int!, $skip: Int!, $orderBy: Item_orderBy!, $where: Item_filter!) {
      items(first: $first, skip: $skip, orderBy: $orderBy, orderDirection: desc, where: $where) { ${ITEM_FIELDS} }
      stats(id: "global") { itemsPosted }
      _meta { block { number } }
    }`,
    {
      first: SUBGRAPH_PAGE_SIZE,
      skip,
      orderBy: sort === "reward" ? "reward" : "itemId",
      // The filter value is the contract's status name (`Completed` for "Returned").
      where: filters.status ? { status: filters.status } : {},
    },
    itemsPageSchema,
  );
  return {
    // Re-sorted so equal rewards fall back to newest first, as on the chain path.
    items: sortItems(data.items.map(fromSubgraphItem), sort),
    nextCursor:
      data.items.length === SUBGRAPH_PAGE_SIZE
        ? String(skip + SUBGRAPH_PAGE_SIZE)
        : null,
    source: "subgraph",
    totalPosted: data.stats?.itemsPosted ?? 0n,
  };
}

async function chainItems(filters: ItemFilters): Promise<ItemPage> {
  // The chain path returns a single page, so the cursor is ignored.
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
  return withFallback(
    async (url) => {
      const data = await querySubgraph(
        url,
        `query Item($id: ID!) {
          item(id: $id) { ${ITEM_FIELDS} }
          _meta { block { number } }
        }`,
        { id: id.toString() },
        z.object({ item: subgraphItemSchema.nullable() }),
      );
      // A just-posted item may not be indexed yet: let the contract say whether it exists.
      if (!data.item) throw new SubgraphUnavailable("Item not indexed");
      return fromSubgraphItem(data.item);
    },
    () => chainItem(id),
  );
}

async function chainItem(id: bigint): Promise<Item | null> {
  const [item] = await readItems([id]);
  return item ?? null;
}

/** An item's event history, newest first. */
export async function getItemHistory(id: bigint): Promise<ItemHistory> {
  return withFallback(
    async (url) => {
      const data = await querySubgraph(
        url,
        `query ItemHistory($item: String!, $first: Int!) {
          itemEvents(first: $first, where: { item: $item }, orderBy: timestamp, orderDirection: desc) {
            kind actor amount finderWins txHash timestamp
          }
          _meta { block { number } }
        }`,
        { item: id.toString(), first: HISTORY_LIMIT },
        z.object({ itemEvents: z.array(subgraphEventSchema) }),
      );
      if (data.itemEvents.length === 0)
        throw new SubgraphUnavailable("Item not indexed");
      return {
        events: data.itemEvents.map((event) => ({
          kind: event.kind,
          actor: event.actor,
          amount: event.amount,
          finderWins: event.finderWins ?? undefined,
          txHash: event.txHash,
          timestamp: event.timestamp,
        })),
        complete: data.itemEvents.some((event) => event.kind === "Posted"),
      };
    },
    () => chainItemHistory(id),
  );
}

async function chainItemHistory(id: bigint): Promise<ItemHistory> {
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
  return withFallback(
    async (url) => {
      const data = await querySubgraph(
        url,
        `query ItemsByUser($user: Bytes!, $first: Int!) {
          lost: items(first: $first, where: { owner: $user }, orderBy: itemId, orderDirection: desc) { ${ITEM_FIELDS} }
          found: items(first: $first, where: { finder: $user }, orderBy: itemId, orderDirection: desc) { ${ITEM_FIELDS} }
          _meta { block { number } }
        }`,
        { user: address.toLowerCase(), first: SUBGRAPH_MAX_FIRST },
        z.object({
          lost: z.array(subgraphItemSchema),
          found: z.array(subgraphItemSchema),
        }),
      );
      return {
        lost: data.lost.map(fromSubgraphItem),
        found: data.found.map(fromSubgraphItem),
        source: "subgraph" as const,
      };
    },
    () => chainItemsByUser(address),
  );
}

async function chainItemsByUser(
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
  return withFallback(async (url) => {
    const data = await querySubgraph(
      url,
      `query Stats {
          stats(id: "global") { itemsPosted itemsReturned totalRewardsPaid openItems }
          _meta { block { number } }
        }`,
      {},
      z.object({ stats: subgraphStatsSchema.nullable() }),
    );
    return {
      // No `Stats` entity yet means nothing has been posted.
      ...(data.stats ?? {
        itemsPosted: 0n,
        itemsReturned: 0n,
        totalRewardsPaid: 0n,
        openItems: 0n,
      }),
      source: "subgraph" as const,
      partial: false,
    };
  }, chainStats);
}

async function chainStats(): Promise<Stats> {
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
