import { getAddress, zeroAddress, type PublicClient } from "viem";
import { describe, expect, it, vi } from "vitest";
import {
  lostAndFound,
  readRoleHolders,
  ROLES,
  statusFromIndex,
  toItem,
} from "../contract";

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

describe("readRoleHolders", () => {
  const verifier = getAddress("0x9c00000000000000000000000000000000002210");
  const revoked = getAddress("0x4b00000000000000000000000000000000091afa");

  function fakeClient(latest: bigint) {
    const getLogs = vi.fn(
      async ({ fromBlock }: { fromBlock: bigint; toBlock: bigint }) =>
        fromBlock === lostAndFound.deployBlock
          ? [
              { args: { role: ROLES.verifier, account: verifier } },
              { args: { role: ROLES.arbiter, account: revoked } },
            ]
          : [{ args: { role: ROLES.verifier, account: verifier } }],
    );
    const multicall = vi.fn(async ({ contracts }: { contracts: unknown[] }) =>
      contracts.map((_, index) => index === 0),
    );
    const client = {
      getBlockNumber: vi.fn(async () => latest),
      getLogs,
      multicall,
    } as unknown as PublicClient;
    return { client, getLogs, multicall };
  }

  it("scans forward from the deploy block for RoleGranted logs only", async () => {
    const start = lostAndFound.deployBlock;
    const { client, getLogs } = fakeClient(start + 25_000n);
    await readRoleHolders(client);
    expect(
      getLogs.mock.calls.map(([args]) => [args.fromBlock, args.toBlock]),
    ).toEqual([
      [start, start + 9_999n],
      [start + 10_000n, start + 19_999n],
      [start + 20_000n, start + 25_000n],
    ]);
    for (const [args] of getLogs.mock.calls) {
      expect(args).toMatchObject({
        address: lostAndFound.address,
        event: { type: "event", name: "RoleGranted" },
      });
    }
  });

  it("does not stop at a block-count cap on a long chain", async () => {
    const { client, getLogs } = fakeClient(
      lostAndFound.deployBlock + 2_000_000n,
    );
    await expect(readRoleHolders(client)).resolves.toBeDefined();
    expect(getLogs).toHaveBeenCalledTimes(201);
  });

  it("dedupes grants and keeps only accounts that still hold the role", async () => {
    const { client, multicall } = fakeClient(
      lostAndFound.deployBlock + 15_000n,
    );
    await expect(readRoleHolders(client)).resolves.toEqual({
      admin: [],
      verifier: [verifier],
      arbiter: [],
    });
    expect(multicall.mock.calls[0][0].contracts).toHaveLength(2);
  });
});
