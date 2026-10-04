import { HARDHAT_CHAIN_ID, SEPOLIA_CHAIN_ID } from "@clf/shared";
import type { Address, Hash } from "viem";
import { hardhat, sepolia } from "viem/chains";

/** Public Sepolia RPC used when no RPC URL is configured (local development, previews). */
export const DEFAULT_SEPOLIA_RPC_URL =
  "https://ethereum-sepolia-rpc.publicnode.com";

const LOCAL_RPC_URL = "http://127.0.0.1:8545";

const configuredChainId = Number(
  process.env.NEXT_PUBLIC_CHAIN_ID || SEPOLIA_CHAIN_ID,
);

/** The one chain the app reads from and writes to: Sepolia, or the local Hardhat node when `NEXT_PUBLIC_CHAIN_ID=31337`. */
export const appChain =
  configuredChainId === HARDHAT_CHAIN_ID ? hardhat : sepolia;

export const isLocalChain = appChain.id === HARDHAT_CHAIN_ID;

const EXPLORER_URL = isLocalChain ? null : "https://sepolia.etherscan.io";

/**
 * RPC URL for the browser (`NEXT_PUBLIC_SEPOLIA_RPC_URL`, a domain-restricted key) or, on the
 * server, `SEPOLIA_RPC_URL` (server key) when it is set.
 */
export function rpcUrl(): string {
  if (isLocalChain) return LOCAL_RPC_URL;
  if (typeof window === "undefined" && process.env.SEPOLIA_RPC_URL) {
    return process.env.SEPOLIA_RPC_URL;
  }
  return process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL || DEFAULT_SEPOLIA_RPC_URL;
}

/** Etherscan link for a transaction; `null` on the local chain, which has no explorer. */
export function txUrl(hash: Hash): string | null {
  return EXPLORER_URL ? `${EXPLORER_URL}/tx/${hash}` : null;
}

/** Etherscan link for an address or contract; `null` on the local chain. */
export function addressUrl(address: Address): string | null {
  return EXPLORER_URL ? `${EXPLORER_URL}/address/${address}` : null;
}

/** Etherscan link to a contract's verified source tab; `null` on the local chain. */
export function sourceCodeUrl(address: Address): string | null {
  const url = addressUrl(address);
  return url ? `${url}#code` : null;
}

/** Etherscan link to a contract's event log tab; `null` on the local chain. */
export function eventsUrl(address: Address): string | null {
  const url = addressUrl(address);
  return url ? `${url}#events` : null;
}
