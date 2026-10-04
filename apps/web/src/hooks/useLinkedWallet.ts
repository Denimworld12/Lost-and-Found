"use client";

import { useUser } from "@clerk/nextjs";
import { getAddress, isAddress, type Address } from "viem";

/**
 * The single wallet linked (signature verified by Clerk) to the signed-in account, checksummed;
 * `null` when there is none or more than one. Writes must come from this wallet.
 */
export function useLinkedWallet(): {
  isLoaded: boolean;
  wallet: Address | null;
  verifiedCount: number;
} {
  const { isLoaded, user } = useUser();
  const wallets = (user?.web3Wallets ?? [])
    .filter(
      (wallet) =>
        wallet.verification?.status === "verified" &&
        isAddress(wallet.web3Wallet, { strict: false }),
    )
    .map((wallet) => getAddress(wallet.web3Wallet));
  return {
    isLoaded,
    wallet: wallets.length === 1 ? wallets[0] : null,
    verifiedCount: wallets.length,
  };
}
