import {
  encodeAbiParameters,
  encodeEventTopics,
  getAbiItem,
  getAddress,
  type Hash,
  type Log,
  type PublicClient,
  type TransactionReceipt,
} from "viem";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeDb } from "@/test/fakes";
import { ApiError } from "../api";
import { lostAndFound } from "../contract";

let db = fakeDb();
vi.mock("@/lib/db", async (original) => ({
  ...(await original<typeof import("@/lib/db/schema")>()),
  getDb: () => db.db,
}));

const { listDisputes, verifyAdminTx } = await import("../admin-server");

const ARBITER = getAddress("0x9FF4CD7D8DaF39334b469D7C009e5BC4830B6947");
const OTHER = getAddress("0x0217C435A8C4a104E641CFA438E582716c862d9B");
const OWNER = getAddress("0xc3094e09bb56e350bcdd9039ae2ce3e73d3900cf");
const FINDER = getAddress("0x3ba2113c559f36040366477d26e286ffae8928a1");
const HASH = `0x${"cd".repeat(32)}` as Hash;
const NOTE = "Checked CCTV at the library desk.";

type EventName = "DisputeResolved" | "ConfigUpdated" | "Paused" | "Unpaused";

/** A log our contract (or `address`) would emit for `eventName`. */
function eventLog(
  eventName: EventName,
  args: Record<string, unknown>,
  address = lostAndFound.address,
): Log {
  const event = getAbiItem({ abi: lostAndFound.abi, name: eventName });
  if (!event || event.type !== "event") throw new Error(eventName);
  const topics = encodeEventTopics({
    abi: lostAndFound.abi,
    eventName,
    args,
  } as Parameters<typeof encodeEventTopics>[0]);
  const plain = event.inputs.filter(
    (input) => !("indexed" in input && input.indexed),
  );
  const data = encodeAbiParameters(
    plain,
    plain.map((input) => args[input.name!]),
  );
  return { address, topics, data } as unknown as Log;
}

function receipt(overrides: Partial<TransactionReceipt> = {}) {
  return {
    status: "success",
    from: ARBITER,
    to: lostAndFound.address,
    logs: [
      eventLog("DisputeResolved", {
        id: 14n,
        finderWins: true,
        arbiter: ARBITER,
      }),
    ],
    transactionHash: HASH,
    ...overrides,
  } as TransactionReceipt;
}

function client(result: TransactionReceipt | Error) {
  return {
    waitForTransactionReceipt: vi.fn(async () => {
      if (result instanceof Error) throw result;
      return result;
    }),
  } as unknown as PublicClient;
}

const resolve = {
  action: "resolve_dispute" as const,
  txHash: HASH,
  itemId: 14n,
  finderWins: true,
  note: NOTE,
};

async function refusal(promise: Promise<unknown>) {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(ApiError);
  return error as ApiError;
}

describe("verifyAdminTx", () => {
  it("records a dispute decision from the DisputeResolved event", async () => {
    await expect(
      verifyAdminTx(resolve, ARBITER, client(receipt())),
    ).resolves.toEqual({ action: "resolve_dispute_finder", target: "14" });
  });

  it("refuses when the event doesn't match the claimed decision", async () => {
    const owner = await refusal(
      verifyAdminTx(
        { ...resolve, finderWins: false },
        ARBITER,
        client(receipt()),
      ),
    );
    expect(owner.status).toBe(400);
    const otherItem = await refusal(
      verifyAdminTx({ ...resolve, itemId: 15n }, ARBITER, client(receipt())),
    );
    expect(otherItem.status).toBe(400);
  });

  it("ignores look-alike events from other contracts", async () => {
    const spoofed = receipt({
      logs: [
        eventLog(
          "DisputeResolved",
          { id: 14n, finderWins: true, arbiter: ARBITER },
          OTHER,
        ),
      ],
    });
    expect(
      (await refusal(verifyAdminTx(resolve, ARBITER, client(spoofed)))).status,
    ).toBe(400);
  });

  it("refuses a transaction sent by another wallet", async () => {
    const error = await refusal(
      verifyAdminTx(resolve, OTHER, client(receipt())),
    );
    expect(error.status).toBe(403);
    expect(error.message).toBe(
      "That transaction wasn't sent from the wallet linked to your account.",
    );
  });

  it("refuses failed, foreign and unmined transactions", async () => {
    expect(
      (
        await refusal(
          verifyAdminTx(
            resolve,
            ARBITER,
            client(receipt({ status: "reverted" })),
          ),
        )
      ).status,
    ).toBe(409);
    expect(
      (
        await refusal(
          verifyAdminTx(resolve, ARBITER, client(receipt({ to: OTHER }))),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await refusal(
          verifyAdminTx(resolve, ARBITER, client(new Error("timeout"))),
        )
      ).code,
    ).toBe("CONFLICT");
  });

  it("records settings from the ConfigUpdated values", async () => {
    const config = receipt({
      from: OTHER,
      logs: [
        eventLog("ConfigUpdated", {
          minReward: 1_000_000_000_000_000n,
          claimStake: 500_000_000_000_000n,
          confirmWindow: 300n,
        }),
      ],
    });
    await expect(
      verifyAdminTx(
        { action: "set_config", txHash: HASH },
        OTHER,
        client(config),
      ),
    ).resolves.toEqual({
      action: "set_config",
      target:
        "minReward=1000000000000000 claimStake=500000000000000 confirmWindow=300",
    });
  });

  it("matches pause and unpause to their events", async () => {
    const paused = receipt({
      from: OTHER,
      logs: [eventLog("Paused", { account: OTHER })],
    });
    await expect(
      verifyAdminTx({ action: "pause", txHash: HASH }, OTHER, client(paused)),
    ).resolves.toEqual({ action: "pause", target: "contract" });
    expect(
      (
        await refusal(
          verifyAdminTx(
            { action: "unpause", txHash: HASH },
            OTHER,
            client(paused),
          ),
        )
      ).status,
    ).toBe(400);
  });
});

describe("listDisputes", () => {
  const raw = (status: number, finder = FINDER) => ({
    owner: OWNER,
    status,
    createdAt: 1n,
    finder,
    claimedAt: 2n,
    claimWindow: 300,
    reward: 10n,
    stake: 5n,
    metadataCID: "bafy",
  });

  beforeEach(() => {
    db = fakeDb();
  });

  it("reads every item and returns the disputed ones with both emails", async () => {
    // Items 1–3: Open, Disputed, Completed.
    const multicall = vi.fn(async () => [
      { status: "success", result: raw(1) },
      { status: "success", result: raw(3) },
      { status: "success", result: raw(4) },
    ]);
    const publicClient = {
      readContract: vi.fn(async () => 3n),
      multicall,
    } as unknown as PublicClient;
    db = fakeDb([
      [
        { wallet: OWNER.toLowerCase(), email: "riya@college.edu.in" },
        { wallet: FINDER.toLowerCase(), email: "arjun@college.edu.in" },
      ],
    ]);

    const disputes = await listDisputes(publicClient);
    expect(disputes).toHaveLength(1);
    expect(disputes[0]).toMatchObject({
      item: { id: 2n, status: "Disputed", owner: OWNER, finder: FINDER },
      ownerEmail: "riya@college.edu.in",
      finderEmail: "arjun@college.edu.in",
    });
  });

  it("asks the database nothing when there are no disputes", async () => {
    const publicClient = {
      readContract: vi.fn(async () => 0n),
      multicall: vi.fn(),
    } as unknown as PublicClient;
    expect(await listDisputes(publicClient)).toEqual([]);
    expect(db.calls).toEqual([]);
  });

  it("leaves an email null when the wallet has no students row", async () => {
    const publicClient = {
      readContract: vi.fn(async () => 1n),
      multicall: vi.fn(async () => [{ status: "success", result: raw(3) }]),
    } as unknown as PublicClient;
    db = fakeDb([
      [{ wallet: OWNER.toLowerCase(), email: "riya@college.edu.in" }],
    ]);
    const [dispute] = await listDisputes(publicClient);
    expect(dispute.finderEmail).toBeNull();
    expect(dispute.ownerEmail).toBe("riya@college.edu.in");
  });
});
