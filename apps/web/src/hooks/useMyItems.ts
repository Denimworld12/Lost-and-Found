"use client";

import { useQuery } from "@tanstack/react-query";
import type { Address } from "viem";
import { useChainTime } from "@/hooks/useChainData";
import { useLinkedWallet } from "@/hooks/useLinkedWallet";
import { useWithdrawable } from "@/hooks/useWallet";
import { needsAction } from "@/lib/dashboard";
import { getItemsByUser, getUserHistory } from "@/lib/graph";

/** Items the address posted (`lost`) and claimed (`found`). Under `['me', address]`, so writes refresh it. */
export function useMyItems(address: Address | null) {
  return useQuery({
    queryKey: ["me", address, "items"],
    queryFn: () => getItemsByUser(address!),
    enabled: Boolean(address),
    refetchInterval: 30_000,
  });
}

export function useMyHistory(
  address: Address | null,
  itemIds: bigint[] | undefined,
) {
  return useQuery({
    queryKey: ["me", address, "history", itemIds?.join(",") ?? ""],
    queryFn: () => getUserHistory(address!, itemIds ?? []),
    enabled: Boolean(address) && itemIds !== undefined,
    staleTime: 60_000,
    retry: 1,
  });
}

/** The signed-in student's "Needs your action" list, from their linked wallet. */
export function useNeeds() {
  const { wallet } = useLinkedWallet();
  const items = useMyItems(wallet);
  const withdrawable = useWithdrawable(wallet);
  const chainNow = useChainTime(30_000);
  const needs = items.data
    ? needsAction(
        items.data.lost,
        items.data.found,
        chainNow,
        withdrawable.data ?? 0n,
      )
    : [];
  return { wallet, items, withdrawable, chainNow, needs };
}
