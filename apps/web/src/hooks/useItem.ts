"use client";

import type { Item } from "@milgaya/shared";
import { useQuery } from "@tanstack/react-query";
import { getItem, getItemHistory } from "@/lib/graph";

/** One item, seeded with the server-rendered copy and refreshed every 15 s. */
export function useItem(id: bigint, initialItem?: Item) {
  return useQuery({
    queryKey: ["item", id.toString()],
    queryFn: () => getItem(id),
    initialData: initialItem,
    refetchInterval: 15_000,
  });
}

/** The item's event history from contract logs (best effort until the subgraph exists). */
export function useItemHistory(id: bigint, status?: string) {
  return useQuery({
    // Status in the key refetches the history when the item changes state.
    queryKey: ["item-history", id.toString(), status ?? ""],
    queryFn: () => getItemHistory(id),
    staleTime: 60_000,
    retry: 1,
  });
}
