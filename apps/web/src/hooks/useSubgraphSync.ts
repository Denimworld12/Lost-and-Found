"use client";

import { useSyncExternalStore } from "react";
import { isSubgraphSyncing, subscribeSubgraphSync } from "@/lib/graph";

/** True from a confirmed write until the subgraph indexes its receipt block. */
export function useSubgraphSyncing(): boolean {
  return useSyncExternalStore(
    subscribeSubgraphSync,
    isSubgraphSyncing,
    () => false,
  );
}
