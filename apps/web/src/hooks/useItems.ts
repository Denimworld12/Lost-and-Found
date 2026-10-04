"use client";

import { useQuery } from "@tanstack/react-query";
import { getItems, type ItemFilters } from "@/lib/graph";

export function itemsQueryKey(filters: ItemFilters) {
  return [
    "items",
    { status: filters.status ?? "all", sort: filters.sort ?? "newest" },
  ] as const;
}

/** Items matching the status filter and sort, refreshed every 30 s. */
export function useItems(filters: ItemFilters) {
  return useQuery({
    queryKey: itemsQueryKey(filters),
    queryFn: () => getItems(filters),
    refetchInterval: 30_000,
  });
}
