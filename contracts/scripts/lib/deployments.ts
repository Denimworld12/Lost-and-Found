import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { getAddress, type Address, type Hash } from "viem";

export const contractsDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

const FUTURE_ID = "LostAndFoundModule#LostAndFound";

/** Ignition deployments that `export-abi` publishes to `packages/shared`. */
export const KNOWN_DEPLOYMENTS = [
  { name: "localhost", deploymentId: "chain-31337" },
  { name: "sepolia", deploymentId: "sepolia-v1" },
  { name: "sepoliaStaging", deploymentId: "sepolia-staging-v1" },
] as const;

/** Ignition parameter file holding the intended role holders, per chain ID. */
export const PARAMETER_FILES: Record<number, string> = {
  31337: "ignition/parameters/localhost.json",
  11155111: "ignition/parameters/sepolia.json",
};

export interface Deployment {
  deploymentId: string;
  chainId: number;
  address: Address;
  deployTx: Hash;
  deployBlock: bigint;
}

interface JournalLine {
  type: string;
  chainId?: number;
  futureId?: string;
  hash?: Hash;
  receipt?: { blockNumber: number; contractAddress?: string };
}

/**
 * Reads the LostAndFound address, deploy transaction and block from an Ignition journal.
 * Returns `undefined` if that deployment doesn't exist on disk or hasn't confirmed yet.
 */
export async function readDeployment(
  deploymentId: string,
): Promise<Deployment | undefined> {
  const journalPath = path.join(
    contractsDir,
    "ignition/deployments",
    deploymentId,
    "journal.jsonl",
  );
  let journal: string;
  try {
    journal = await readFile(journalPath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }

  let chainId: number | undefined;
  let confirm: JournalLine | undefined;
  for (const line of journal.split("\n")) {
    if (line.trim() === "") continue;
    const entry = JSON.parse(line) as JournalLine;
    if (entry.type === "DEPLOYMENT_INITIALIZE") chainId = entry.chainId;
    if (
      entry.type === "TRANSACTION_CONFIRM" &&
      entry.futureId === FUTURE_ID &&
      entry.receipt?.contractAddress !== undefined
    ) {
      confirm = entry;
    }
  }
  if (
    chainId === undefined ||
    confirm?.receipt?.contractAddress === undefined
  ) {
    return undefined;
  }

  return {
    deploymentId,
    chainId,
    address: getAddress(confirm.receipt.contractAddress),
    deployTx: confirm.hash!,
    deployBlock: BigInt(confirm.receipt.blockNumber),
  };
}

export interface RoleHolders {
  admin: Address;
  verifier: Address;
  arbiter: Address;
}

/** Reads the intended admin, verifier and arbiter from a chain's Ignition parameter file. */
export async function readRoleHolders(chainId: number): Promise<RoleHolders> {
  const file = PARAMETER_FILES[chainId];
  if (file === undefined) {
    throw new Error(`No Ignition parameter file for chain ${chainId}`);
  }
  const params = JSON.parse(
    await readFile(path.join(contractsDir, file), "utf8"),
  ).LostAndFoundModule as Record<string, string>;
  return {
    admin: getAddress(params.admin),
    verifier: getAddress(params.verifier),
    arbiter: getAddress(params.arbiter),
  };
}
