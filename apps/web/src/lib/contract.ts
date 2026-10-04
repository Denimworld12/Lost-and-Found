import {
  ITEM_STATUSES,
  lostAndFoundAbi,
  lostAndFoundAddresses,
  type Item,
  type ItemStatus,
} from "@clf/shared";
import {
  createPublicClient,
  getAddress,
  http,
  isAddress,
  keccak256,
  parseEventLogs,
  toHex,
  zeroAddress,
  zeroHash,
  type Address,
  type Hash,
  type PublicClient,
} from "viem";
import { appChain, rpcUrl } from "./chain";

const deployment = lostAndFoundAddresses[appChain.id];

function configuredAddress(): Address {
  const fromEnv = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS;
  if (fromEnv && isAddress(fromEnv)) return getAddress(fromEnv);
  if (deployment) return deployment.address;
  throw new Error(`No LostAndFound deployment for chain ${appChain.id}`);
}

function configuredDeployBlock(): bigint {
  const fromEnv = process.env.NEXT_PUBLIC_CONTRACT_DEPLOY_BLOCK;
  if (fromEnv && /^\d+$/.test(fromEnv)) return BigInt(fromEnv);
  return deployment?.deployBlock ?? 0n;
}

/** The LostAndFound contract the app talks to. `NEXT_PUBLIC_CONTRACT_ADDRESS` overrides the shared address. */
export const lostAndFound = {
  address: configuredAddress(),
  abi: lostAndFoundAbi,
  /** Block the contract was created in; event scans start here. */
  deployBlock: configuredDeployBlock(),
} as const;

let client: PublicClient | undefined;

/** Read-only viem client for the app chain. JSON-RPC batching and multicall are on. */
export function getPublicClient(): PublicClient {
  client ??= createPublicClient({
    chain: appChain,
    transport: http(rpcUrl(), { batch: true, retryCount: 2 }),
    batch: { multicall: true },
  }) as PublicClient;
  return client;
}

// ─────────────────────────────────────────────────────────────── Items

interface RawItem {
  owner: Address;
  status: number;
  createdAt: bigint;
  finder: Address;
  claimedAt: bigint;
  claimWindow: number;
  reward: bigint;
  stake: bigint;
  metadataCID: string;
}

export function statusFromIndex(index: number): ItemStatus {
  const name = ITEM_STATUSES[index];
  if (!name || name === "None") throw new Error(`Unknown item status ${index}`);
  return name;
}

/** Converts the contract's `Item` struct into the app's `Item` shape. */
export function toItem(id: bigint, raw: RawItem): Item {
  const claimed = raw.finder !== zeroAddress;
  return {
    id,
    owner: getAddress(raw.owner),
    status: statusFromIndex(raw.status),
    createdAt: raw.createdAt,
    finder: claimed ? getAddress(raw.finder) : null,
    claimedAt: claimed ? raw.claimedAt : null,
    claimWindow: BigInt(raw.claimWindow),
    reward: raw.reward,
    stake: raw.stake,
    metadataCID: raw.metadataCID,
  };
}

export async function readItemCount(
  publicClient = getPublicClient(),
): Promise<bigint> {
  return publicClient.readContract({
    address: lostAndFound.address,
    abi: lostAndFound.abi,
    functionName: "itemCount",
  });
}

/** Reads items by ID in one multicall. IDs that don't exist are left out. */
export async function readItems(
  ids: readonly bigint[],
  publicClient = getPublicClient(),
): Promise<Item[]> {
  if (ids.length === 0) return [];
  const results = await publicClient.multicall({
    contracts: ids.map((id) => ({
      address: lostAndFound.address,
      abi: lostAndFound.abi,
      functionName: "getItem" as const,
      args: [id] as const,
    })),
    allowFailure: true,
  });
  const items: Item[] = [];
  results.forEach((result, index) => {
    if (result.status === "success")
      items.push(toItem(ids[index], result.result as RawItem));
  });
  return items;
}

/** Reads one item; `null` when the ID doesn't exist (the contract reverts `ItemNotFound`). */
export async function readItem(
  id: bigint,
  publicClient = getPublicClient(),
): Promise<Item | null> {
  if (id < 1n) return null;
  const count = await readItemCount(publicClient);
  if (id > count) return null;
  const raw = await publicClient.readContract({
    address: lostAndFound.address,
    abi: lostAndFound.abi,
    functionName: "getItem",
    args: [id],
  });
  return toItem(id, raw as RawItem);
}

// ─────────────────────────────────────────────────────────────── Config and totals

export interface ContractConfig {
  minReward: bigint;
  claimStake: bigint;
  /** Confirm window for new claims, in seconds. */
  confirmWindow: bigint;
  paused: boolean;
}

export async function readConfig(
  publicClient = getPublicClient(),
): Promise<ContractConfig> {
  const base = {
    address: lostAndFound.address,
    abi: lostAndFound.abi,
  } as const;
  const [minReward, claimStake, confirmWindow, paused] =
    await publicClient.multicall({
      contracts: [
        { ...base, functionName: "minReward" },
        { ...base, functionName: "claimStake" },
        { ...base, functionName: "confirmWindow" },
        { ...base, functionName: "paused" },
      ],
      allowFailure: false,
    });
  return {
    minReward,
    claimStake,
    confirmWindow: BigInt(confirmWindow),
    paused,
  };
}

export interface ContractTotals {
  itemCount: bigint;
  /** ETH currently held for open and claimed items. */
  totalEscrowed: bigint;
  /** ETH credited to balances and not yet withdrawn. */
  totalCredited: bigint;
}

export async function readTotals(
  publicClient = getPublicClient(),
): Promise<ContractTotals> {
  const base = {
    address: lostAndFound.address,
    abi: lostAndFound.abi,
  } as const;
  const [itemCount, totalEscrowed, totalCredited] =
    await publicClient.multicall({
      contracts: [
        { ...base, functionName: "itemCount" },
        { ...base, functionName: "totalEscrowed" },
        { ...base, functionName: "totalCredited" },
      ],
      allowFailure: false,
    });
  return { itemCount, totalEscrowed, totalCredited };
}

// ─────────────────────────────────────────────────────────────── Events

/** Blocks per `eth_getLogs` call. Most free RPC plans accept 10,000. */
const LOG_CHUNK = 10_000n;
/** Chunks fetched in parallel per round. */
const LOG_PARALLEL = 5;

type DecodedLog = ReturnType<
  typeof parseEventLogs<typeof lostAndFoundAbi>
>[number];

export interface ContractEvent {
  name: DecodedLog["eventName"];
  args: Record<string, unknown>;
  /** Item the event belongs to, when it has an `id` argument. */
  itemId: bigint | null;
  txHash: Hash;
  blockNumber: bigint;
  logIndex: number;
  /** Block timestamp in seconds; `null` if the block couldn't be read. */
  timestamp: bigint | null;
}

function toContractEvent(log: DecodedLog): ContractEvent {
  const args = (log.args ?? {}) as Record<string, unknown>;
  return {
    name: log.eventName,
    args,
    itemId: typeof args.id === "bigint" ? args.id : null,
    txHash: log.transactionHash,
    blockNumber: log.blockNumber,
    logIndex: log.logIndex,
    timestamp: null,
  };
}

function newestFirst(a: ContractEvent, b: ContractEvent) {
  if (a.blockNumber !== b.blockNumber)
    return a.blockNumber > b.blockNumber ? -1 : 1;
  return b.logIndex - a.logIndex;
}

async function fetchChunk(
  publicClient: PublicClient,
  fromBlock: bigint,
  toBlock: bigint,
) {
  const logs = await publicClient.getLogs({
    address: lostAndFound.address,
    fromBlock,
    toBlock,
  });
  return parseEventLogs({ abi: lostAndFound.abi, logs }).map(toContractEvent);
}

async function addTimestamps(
  events: ContractEvent[],
  publicClient: PublicClient,
) {
  const blocks = [...new Set(events.map((event) => event.blockNumber))];
  const timestamps = new Map<bigint, bigint>();
  await Promise.all(
    blocks.map(async (blockNumber) => {
      try {
        const block = await publicClient.getBlock({ blockNumber });
        timestamps.set(blockNumber, block.timestamp);
      } catch {
        // Leave the timestamp null; the row still links to Etherscan.
      }
    }),
  );
  return events.map((event) => ({
    ...event,
    timestamp: timestamps.get(event.blockNumber) ?? null,
  }));
}

export interface EventScanOptions {
  /** Stop once this many matching events are found. */
  limit: number;
  /** Keep only events for which this returns true. */
  filter?: (event: ContractEvent) => boolean;
  /** Stop scanning (newest to oldest) once this returns true for a matching event. */
  stopAt?: (event: ContractEvent) => boolean;
  /** Upper bound on `eth_getLogs` calls. */
  maxChunks?: number;
}

export interface EventScanResult {
  /** Newest first. */
  events: ContractEvent[];
  /** True when the scan reached the deploy block or a `stopAt` event, so nothing older was missed. */
  complete: boolean;
}

/**
 * Reads contract events newest first by walking back from the latest block in chunks.
 * Used while there is no subgraph; the RPC's `eth_getLogs` range limit decides whether it works.
 */
export async function scanEvents(
  { limit, filter = () => true, stopAt, maxChunks = 40 }: EventScanOptions,
  publicClient = getPublicClient(),
): Promise<EventScanResult> {
  const latest = await publicClient.getBlockNumber();
  const found: ContractEvent[] = [];
  let toBlock = latest;
  let chunks = 0;
  let stopped = false;

  while (
    toBlock >= lostAndFound.deployBlock &&
    chunks < maxChunks &&
    !stopped
  ) {
    const ranges: [bigint, bigint][] = [];
    for (
      let i = 0;
      i < LOG_PARALLEL &&
      toBlock >= lostAndFound.deployBlock &&
      chunks < maxChunks;
      i++
    ) {
      const fromBlock =
        toBlock - LOG_CHUNK + 1n > lostAndFound.deployBlock
          ? toBlock - LOG_CHUNK + 1n
          : lostAndFound.deployBlock;
      ranges.push([fromBlock, toBlock]);
      toBlock = fromBlock - 1n;
      chunks++;
    }
    const batches = await Promise.all(
      ranges.map(([from, to]) => fetchChunk(publicClient, from, to)),
    );
    const matching = batches.flat().filter(filter).sort(newestFirst);
    for (const event of matching) {
      found.push(event);
      if (stopAt?.(event)) {
        stopped = true;
        break;
      }
    }
    if (!stopAt && found.length >= limit) break;
  }

  const complete = stopped || toBlock < lostAndFound.deployBlock;
  return {
    events: await addTimestamps(found.slice(0, limit), publicClient),
    complete,
  };
}

// ─────────────────────────────────────────────────────────────── Roles

export const ROLES = {
  admin: zeroHash,
  verifier: keccak256(toHex("VERIFIER_ROLE")),
  arbiter: keccak256(toHex("ARBITER_ROLE")),
} as const;

export type RoleName = keyof typeof ROLES;

export type RoleHolders = Record<RoleName, Address[]>;

/**
 * Current holders of each role. The contract isn't enumerable, so candidates come from
 * `RoleGranted` events and each one is confirmed with `hasRole`.
 */
export async function readRoleHolders(
  publicClient = getPublicClient(),
): Promise<RoleHolders> {
  const { events, complete } = await scanEvents(
    {
      limit: Number.MAX_SAFE_INTEGER,
      filter: (event) => event.name === "RoleGranted",
      maxChunks: 120,
    },
    publicClient,
  );
  if (!complete)
    throw new Error("Role history is longer than the RPC scan allows");

  const candidates = new Map<string, { role: Hash; account: Address }>();
  for (const event of events) {
    const role = event.args.role as Hash;
    const account = getAddress(event.args.account as Address);
    candidates.set(`${role}:${account}`, { role, account });
  }
  const list = [...candidates.values()];
  const checks = await publicClient.multicall({
    contracts: list.map(({ role, account }) => ({
      address: lostAndFound.address,
      abi: lostAndFound.abi,
      functionName: "hasRole" as const,
      args: [role, account] as const,
    })),
    allowFailure: false,
  });

  const holders: RoleHolders = { admin: [], verifier: [], arbiter: [] };
  list.forEach(({ role, account }, index) => {
    if (!checks[index]) return;
    const name = (Object.keys(ROLES) as RoleName[]).find(
      (key) => ROLES[key] === role,
    );
    if (name) holders[name].push(account);
  });
  return holders;
}
