"use client";

import { useQuery } from "@tanstack/react-query";
import { getAddress, isAddressEqual, type Address } from "viem";
import { useConnection } from "wagmi";
import { useIsClient } from "@/hooks/useIsClient";
import { useLinkedWallet } from "@/hooks/useLinkedWallet";
import { appChain } from "@/lib/chain";
import { getPublicClient, lostAndFound, readIsVerified } from "@/lib/contract";

/**
 * Where the visitor's wallet stands, in the order they must fix things:
 * no MetaMask → not connected → wrong network → not the wallet linked in Clerk → ready.
 */
export type WalletStatus =
  | "loading"
  | "no-provider"
  | "disconnected"
  | "wrong-chain"
  | "wrong-wallet"
  | "ready";

function hasInjectedProvider(): boolean {
  return (
    typeof window !== "undefined" &&
    "ethereum" in window &&
    Boolean((window as { ethereum?: unknown }).ethereum)
  );
}

/** Phones only get MetaMask inside the MetaMask app's browser. */
export function isMobileBrowser(): boolean {
  return (
    typeof navigator !== "undefined" &&
    /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
  );
}

/** `https://metamask.app.link/dapp/<host><path>`: opens this page in the MetaMask app. */
export function metaMaskDeepLink(): string {
  if (typeof window === "undefined") return "https://metamask.app.link";
  return `https://metamask.app.link/dapp/${window.location.host}${window.location.pathname}`;
}

export function useWallet() {
  const isClient = useIsClient();
  const connection = useConnection();
  const { isLoaded, wallet: linkedWallet } = useLinkedWallet();
  const address = connection.address ? getAddress(connection.address) : null;

  let status: WalletStatus;
  if (!isClient || connection.status === "reconnecting") status = "loading";
  else if (!address)
    status = hasInjectedProvider() ? "disconnected" : "no-provider";
  else if (connection.chainId !== appChain.id) status = "wrong-chain";
  else if (linkedWallet && !isAddressEqual(address, linkedWallet))
    status = "wrong-wallet";
  else status = "ready";

  return {
    status,
    /** Wallet connected in MetaMask (checksummed). */
    address,
    /** Wallet linked to the Clerk account; the app treats this as "you". */
    linkedWallet,
    linkedLoaded: isLoaded,
    chainId: connection.chainId,
  };
}

/** Whether the contract accepts posts and claims from `address`. */
export function useIsVerified(address: Address | null) {
  return useQuery({
    queryKey: ["is-verified", address],
    queryFn: () => readIsVerified(address!),
    enabled: Boolean(address),
    staleTime: 60_000,
  });
}

/** ETH credited to `address` in the contract and not yet withdrawn (`balances[address]`). */
export function useWithdrawable(address: Address | null) {
  return useQuery({
    queryKey: ["balance", address],
    queryFn: () =>
      getPublicClient().readContract({
        address: lostAndFound.address,
        abi: lostAndFound.abi,
        functionName: "balances",
        args: [address!],
      }),
    enabled: Boolean(address),
    refetchInterval: 30_000,
  });
}
