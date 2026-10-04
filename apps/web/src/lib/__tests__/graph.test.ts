import type { Item, ItemStatus } from "@clf/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";

const chain = vi.hoisted(() => ({
  items: [] as Item[],
  requested: [] as bigint[][],
}));

vi.mock("../contract", () => ({
  getPublicClient: () => ({}),
  readItemCount: async () => BigInt(chain.items.length),
  readItems: async (ids: readonly bigint[]) => {
    chain.requested.push([...ids]);
    return ids.map((id) => chain.items[Number(id) - 1]).filter(Boolean);
  },
  scanEvents: vi.fn(),
}));

const {
  CHAIN_FALLBACK_LIMIT,
  getItem,
  getItems,
  getItemsByUser,
  getStats,
  getUserHistory,
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
