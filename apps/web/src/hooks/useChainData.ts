"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  getPublicClient,
  readConfig,
  readRoleHolders,
  readTotals,
} from "@/lib/contract";
import { getRecentEvents, getStats } from "@/lib/graph";

export function useStats() {
  return useQuery({
    queryKey: ["stats"],
    queryFn: getStats,
    refetchInterval: 60_000,
  });
}

export function useContractConfig() {
  return useQuery({
    queryKey: ["contract-config"],
    queryFn: () => readConfig(),
    staleTime: 60_000,
  });
}

export function useContractTotals() {
  return useQuery({
    queryKey: ["contract-totals"],
    queryFn: () => readTotals(),
    refetchInterval: 60_000,
  });
}

export function useRoleHolders() {
  return useQuery({
    queryKey: ["role-holders"],
    queryFn: () => readRoleHolders(),
    staleTime: 5 * 60_000,
    retry: 1,
  });
}

export function useRecentEvents(limit = 20) {
  return useQuery({
    queryKey: ["recent-events", limit],
    queryFn: () => getRecentEvents(limit),
    staleTime: 60_000,
    retry: 1,
  });
}

/**
 * Chain time in seconds, ticking every `tickMs`. Reads the latest block's timestamp once a
 * minute and advances it with the device clock in between, so countdowns follow the chain.
 */
export function useChainTime(tickMs = 30_000): bigint | null {
  const { data: offsetMs } = useQuery({
    queryKey: ["chain-time-offset"],
    queryFn: async () => {
      const block = await getPublicClient().getBlock({ blockTag: "latest" });
      return Number(block.timestamp) * 1000 - Date.now();
    },
    refetchInterval: 60_000,
  });
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), tickMs);
    return () => clearInterval(timer);
  }, [tickMs]);
  if (offsetMs === undefined) return null;
  return BigInt(Math.floor((now + offsetMs) / 1000));
}
