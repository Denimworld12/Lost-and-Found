import type { Item, ItemStatus } from "@milgaya/shared";
import { getAddress } from "viem";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const chain = vi.hoisted(() => ({
  items: [] as Item[],
  requested: [] as bigint[][],
  head: 1_000n,
}));

vi.mock("../contract", () => ({
  getPublicClient: () => ({ getBlockNumber: async () => chain.head }),
  readItemCount: async () => BigInt(chain.items.length),
  readItems: async (ids: readonly bigint[]) => {
    chain.requested.push([...ids]);
    return ids.map((id) => chain.items[Number(id) - 1]).filter(Boolean);
  },
  scanEvents: vi.fn(),
}));

const {
  awaitSubgraphBlock,
  CHAIN_FALLBACK_LIMIT,
  getItem,
  getItems,
  getItemHistory,
  getItemsByUser,
  getStats,
  getUserHistory,
  isSubgraphSyncing,
  subscribeSubgraphSync,
  SUBGRAPH_PAGE_SIZE,
  toItemEvent,
} = await import("../graph");
const { scanEvents } = await import("../contract");

const OWNER = "0x00000000000000000000000000000000000000aa" as const;
const FINDER = "0x00000000000000000000000000000000000000bb" as const;

function makeItem(
  id: number,
  status: ItemStatus,
  reward: bigint,
  finder: `0x${string}` | null = null,
): Item {
  return {
    id: BigInt(id),
    owner: OWNER,
    status,
    createdAt: 1_000n + BigInt(id),
    finder,
    claimedAt: finder ? 2_000n : null,
    claimWindow: finder ? 259_200n : 0n,
    reward,
    stake: finder ? 5n : 0n,
    metadataCID: `cid-${id}`,
  };
}

beforeEach(() => {
  chain.requested = [];
  chain.head = 1_000n;
  // Local development: no subgraph, so every query reads the contract.
  vi.stubEnv("NEXT_PUBLIC_SUBGRAPH_URL", "");
  chain.items = [
    makeItem(1, "Completed", 10n, FINDER),
    makeItem(2, "Open", 30n),
    makeItem(3, "Open", 20n),
    makeItem(4, "Cancelled", 50n),
  ];
});

describe("getItems (direct from chain)", () => {
  it("returns every status newest first when no status is given", async () => {
    const page = await getItems();
    expect(page.items.map((item) => item.id)).toEqual([4n, 3n, 2n, 1n]);
    expect(page).toMatchObject({
      source: "chain",
      nextCursor: null,
      totalPosted: 4n,
    });
  });

  it("filters by status and sorts by highest reward", async () => {
    const page = await getItems({ status: "Open", sort: "reward" });
    expect(page.items.map((item) => item.id)).toEqual([2n, 3n]);
  });

  it("reads only the latest 50 items", async () => {
    chain.items = Array.from({ length: 60 }, (_, index) =>
      makeItem(index + 1, "Open", 1n),
    );
    const page = await getItems();
    expect(chain.requested[0]).toHaveLength(CHAIN_FALLBACK_LIMIT);
    expect(chain.requested[0][0]).toBe(60n);
    expect(page.items.at(-1)?.id).toBe(11n);
  });

  it("handles a contract with no items", async () => {
    chain.items = [];
    const page = await getItems({ status: "Open" });
    expect(page.items).toEqual([]);
    expect(page.totalPosted).toBe(0n);
  });
});

describe("getItem", () => {
  it("returns the item or null", async () => {
    expect((await getItem(2n))?.status).toBe("Open");
    expect(await getItem(99n)).toBeNull();
    expect(await getItem(0n)).toBeNull();
  });
});

describe("getItemsByUser", () => {
  it("splits items the address posted from items it claimed", async () => {
    const mine = await getItemsByUser(OWNER);
    expect(mine.lost).toHaveLength(4);
    const found = await getItemsByUser(
      "0x00000000000000000000000000000000000000BB",
    );
    expect(found.found.map((item) => item.id)).toEqual([1n]);
    expect(found.lost).toEqual([]);
  });
});

describe("getStats", () => {
  it("counts returned items, rewards paid and open items", async () => {
    expect(await getStats()).toEqual({
      itemsPosted: 4n,
      itemsReturned: 1n,
      totalRewardsPaid: 10n,
      openItems: 2n,
      source: "chain",
      partial: false,
    });
  });

  it("flags totals as partial past the fallback limit", async () => {
    chain.items = Array.from({ length: 51 }, (_, index) =>
      makeItem(index + 1, "Open", 1n),
    );
    expect((await getStats()).partial).toBe(true);
  });
});

describe("toItemEvent", () => {
  const base = {
    txHash: "0xabc" as const,
    blockNumber: 1n,
    logIndex: 0,
    timestamp: 5n,
    itemId: 1n,
  };

  it("maps item events to history steps", () => {
    expect(
      toItemEvent({
        ...base,
        name: "ItemClaimed",
        args: { id: 1n, finder: FINDER, stake: 5n },
      }),
    ).toMatchObject({ kind: "Claimed", actor: FINDER, amount: 5n });
    expect(
      toItemEvent({
        ...base,
        name: "DisputeResolved",
        args: { id: 1n, finderWins: false, arbiter: OWNER },
      }),
    ).toMatchObject({ kind: "Resolved", finderWins: false });
  });

  it("ignores events that aren't about an item", () => {
    expect(
      toItemEvent({
        ...base,
        itemId: null,
        name: "Withdrawn",
        args: { to: FINDER, amount: 1n },
      }),
    ).toBeNull();
  });
});

describe("getUserHistory", () => {
  const event = (
    name: string,
    args: Record<string, unknown>,
    itemId: bigint | null,
  ) => ({
    name,
    args,
    itemId,
    txHash: "0xabc" as const,
    blockNumber: 1n,
    logIndex: 0,
    timestamp: 5n,
  });

  it("keeps events the student sent or received and events on their items", async () => {
    const scan = vi.mocked(scanEvents);
    scan.mockResolvedValueOnce({ events: [], complete: true });
    await getUserHistory(FINDER, [4n]);
    const { filter } = scan.mock.calls.at(-1)![0];
    const keep = (e: ReturnType<typeof event>) =>
      filter!(e as Parameters<NonNullable<typeof filter>>[0]);

    expect(keep(event("ItemClaimed", { id: 1n, finder: FINDER }, 1n))).toBe(
      true,
    );
    expect(
      keep(
        event(
          "Withdrawn",
          { to: FINDER.toUpperCase().replace("0X", "0x"), amount: 1n },
          null,
        ),
      ),
    ).toBe(true);
    // Owner confirmed the student's claim on item 4: no student address in the args.
    expect(keep(event("ItemCancelled", { id: 4n }, 4n))).toBe(true);
    expect(keep(event("ItemPosted", { id: 2n, owner: OWNER }, 2n))).toBe(false);
    expect(keep(event("StudentVerified", { student: FINDER }, null))).toBe(
      false,
    );
  });

  it("turns withdrawals and item events into dashboard rows", async () => {
    vi.mocked(scanEvents).mockResolvedValueOnce({
      events: [
        event("Withdrawn", { to: FINDER, amount: 15n }, null),
        event("ReturnConfirmed", { id: 4n, finder: FINDER, amount: 15n }, 4n),
      ] as never,
      complete: true,
    });
    const { events } = await getUserHistory(FINDER, [4n]);
    expect(events).toMatchObject([
      { kind: "Withdrawn", itemId: null, amount: 15n },
      { kind: "Confirmed", itemId: 4n, actor: FINDER, amount: 15n },
    ]);
  });
});

// ─────────────────────────────────────────────────────────────── Subgraph

const SUBGRAPH_URL =
  "https://api.studio.thegraph.com/query/1/lost-and-found/v0.0.1";
const TX = `0x${"ab".repeat(32)}` as const;

function rawItem(
  id: number,
  status: ItemStatus,
  reward: string,
  finder?: string,
) {
  return {
    itemId: String(id),
    owner: OWNER,
    finder: finder ?? null,
    reward,
    stake: finder ? "5" : "0",
    metadataCID: `cid-${id}`,
    status,
    createdAt: String(1_000 + id),
    claimedAt: finder ? "2000" : null,
    claimWindow: finder ? "259200" : "0",
  };
}

interface GraphRequest {
  query: string;
  variables: Record<string, unknown>;
}

function mockSubgraph(
  respond: (request: GraphRequest) => unknown,
  indexedBlock = 1_000,
) {
  const requests: GraphRequest[] = [];
  const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
    expect(url).toBe(SUBGRAPH_URL);
    const request = JSON.parse(String(init.body)) as GraphRequest;
    requests.push(request);
    const data = respond(request);
    return new Response(
      JSON.stringify(
        data instanceof Error
          ? { errors: [{ message: data.message }] }
          : {
              data: {
                ...(data as object),
                _meta: { block: { number: indexedBlock } },
              },
            },
      ),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  });
  vi.stubGlobal("fetch", fetchMock);
  return { requests, fetchMock };
}

describe("with a subgraph", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SUBGRAPH_URL", SUBGRAPH_URL);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("getItems reads a page from the subgraph with the status filter", async () => {
    const { requests } = mockSubgraph(() => ({
      items: [
        rawItem(7, "Completed", "40", FINDER),
        rawItem(5, "Completed", "40", FINDER),
      ],
      stats: { itemsPosted: "9" },
    }));
    const page = await getItems({ status: "Completed", sort: "reward" });
    expect(requests[0].variables).toMatchObject({
      where: { status: "Completed" },
      orderBy: "reward",
      skip: 0,
    });
    expect(page).toMatchObject({
      source: "subgraph",
      totalPosted: 9n,
      nextCursor: null,
    });
    expect(page.items.map((item) => item.id)).toEqual([7n, 5n]);
    expect(page.items[0]).toEqual({
      id: 7n,
      owner: getAddress(OWNER),
      status: "Completed",
      createdAt: 1_007n,
      finder: getAddress(FINDER),
      claimedAt: 2_000n,
      claimWindow: 259_200n,
      reward: 40n,
      stake: 5n,
      metadataCID: "cid-7",
    });
    expect(chain.requested).toEqual([]);
  });

  it("getItems pages with a cursor", async () => {
    const { requests } = mockSubgraph(() => ({
      items: Array.from({ length: SUBGRAPH_PAGE_SIZE }, (_, index) =>
        rawItem(300 - index, "Open", "1"),
      ),
      stats: { itemsPosted: "300" },
    }));
    const first = await getItems();
    expect(requests[0].variables).toMatchObject({
      where: {},
      orderBy: "itemId",
    });
    expect(first.nextCursor).toBe(String(SUBGRAPH_PAGE_SIZE));
    await getItems({}, first.nextCursor);
    expect(requests[1].variables.skip).toBe(SUBGRAPH_PAGE_SIZE);
  });

  it("falls back to the chain when the subgraph errors", async () => {
    mockSubgraph(() => new Error("indexing error"));
    const page = await getItems();
    expect(page.source).toBe("chain");
    expect(page.items.map((item) => item.id)).toEqual([4n, 3n, 2n, 1n]);
  });

  it("falls back to the chain when the subgraph can't be reached", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("fetch failed");
      }),
    );
    expect((await getStats()).source).toBe("chain");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("bad gateway", { status: 502 })),
    );
    expect((await getItemsByUser(OWNER)).source).toBe("chain");
  });

  it("falls back to the chain when the subgraph is more than 50 blocks behind", async () => {
    chain.head = 1_051n;
    mockSubgraph(() => ({ items: [], stats: null }), 1_000);
    expect((await getItems()).source).toBe("chain");

    chain.head = 1_050n;
    expect((await getItems()).source).toBe("subgraph");
  });

  it("getItem uses the subgraph, and the chain for items it hasn't indexed", async () => {
    mockSubgraph(({ variables }) => ({
      item: variables.id === "2" ? rawItem(2, "Claimed", "30", FINDER) : null,
    }));
    expect((await getItem(2n))?.status).toBe("Claimed");
    expect(chain.requested).toEqual([]);
    expect((await getItem(3n))?.status).toBe("Open");
    expect(chain.requested).toEqual([[3n]]);
  });

  it("reads the contract and reports syncing until the subgraph indexes a write's receipt block", async () => {
    // Item 2 was just claimed on chain (block 1_000); the subgraph still has it Open.
    chain.items[1] = makeItem(2, "Claimed", 30n, FINDER);
    let indexed = 998;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              data: {
                item: rawItem(
                  2,
                  indexed < 1_000 ? "Open" : "Claimed",
                  "30",
                  FINDER,
                ),
                _meta: { block: { number: indexed } },
              },
            }),
          ),
      ),
    );
    const changes = vi.fn();
    const unsubscribe = subscribeSubgraphSync(changes);

    awaitSubgraphBlock(1_000n);
    expect(isSubgraphSyncing()).toBe(true);
    expect((await getItem(2n))?.status).toBe("Claimed");
    expect(chain.requested).toEqual([[2n]]);
    expect(isSubgraphSyncing()).toBe(true);

    indexed = 1_000;
    expect((await getItem(2n))?.status).toBe("Claimed");
    expect(chain.requested).toEqual([[2n]]);
    expect(isSubgraphSyncing()).toBe(false);
    expect(changes).toHaveBeenCalledTimes(2);
    unsubscribe();
  });

  it("doesn't wait for the subgraph when none is configured", () => {
    vi.stubEnv("NEXT_PUBLIC_SUBGRAPH_URL", "");
    awaitSubgraphBlock(1_000n);
    expect(isSubgraphSyncing()).toBe(false);
  });

  it("getItemsByUser queries owner and finder by lowercase address", async () => {
    const { requests } = mockSubgraph(() => ({
      lost: [rawItem(2, "Open", "30")],
      found: [rawItem(1, "Completed", "10", FINDER)],
    }));
    const mine = await getItemsByUser(
      "0x00000000000000000000000000000000000000BB",
    );
    expect(requests[0].variables.user).toBe(FINDER);
    expect(mine.source).toBe("subgraph");
    expect(mine.lost.map((item) => item.id)).toEqual([2n]);
    expect(mine.found.map((item) => item.id)).toEqual([1n]);
  });

  it("getStats returns the subgraph's exact totals", async () => {
    mockSubgraph(() => ({
      stats: {
        itemsPosted: "120",
        itemsReturned: "40",
        totalRewardsPaid: "123456789012345678901",
        openItems: "70",
      },
    }));
    expect(await getStats()).toEqual({
      itemsPosted: 120n,
      itemsReturned: 40n,
      totalRewardsPaid: 123_456_789_012_345_678_901n,
      openItems: 70n,
      source: "subgraph",
      partial: false,
    });
  });

  it("getStats is all zeros before anything is posted", async () => {
    mockSubgraph(() => ({ stats: null }));
    expect(await getStats()).toMatchObject({
      itemsPosted: 0n,
      openItems: 0n,
      source: "subgraph",
    });
  });

  it("getItemHistory maps ItemEvents and doesn't scan logs", async () => {
    mockSubgraph(() => ({
      itemEvents: [
        {
          kind: "Resolved",
          actor: FINDER,
          amount: null,
          finderWins: true,
          txHash: TX,
          timestamp: "30",
        },
        {
          kind: "Posted",
          actor: OWNER,
          amount: "10",
          finderWins: null,
          txHash: TX,
          timestamp: "10",
        },
      ],
    }));
    const scan = vi.mocked(scanEvents);
    scan.mockClear();
    const history = await getItemHistory(1n);
    expect(scan).not.toHaveBeenCalled();
    expect(history.complete).toBe(true);
    expect(history.events).toEqual([
      {
        kind: "Resolved",
        actor: getAddress(FINDER),
        amount: null,
        finderWins: true,
        txHash: TX,
        timestamp: 30n,
      },
      {
        kind: "Posted",
        actor: getAddress(OWNER),
        amount: 10n,
        finderWins: undefined,
        txHash: TX,
        timestamp: 10n,
      },
    ]);
  });

  it("getItemHistory scans logs when the subgraph has no events for the item", async () => {
    mockSubgraph(() => ({ itemEvents: [] }));
    vi.mocked(scanEvents).mockResolvedValueOnce({
      events: [],
      complete: false,
    });
    expect(await getItemHistory(9n)).toEqual({ events: [], complete: false });
  });
});

describe("without a subgraph", () => {
  it("never calls fetch", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect((await getItems()).source).toBe("chain");
    expect((await getStats()).source).toBe("chain");
    expect((await getItemsByUser(OWNER)).source).toBe("chain");
    expect((await getItem(1n))?.id).toBe(1n);
    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
