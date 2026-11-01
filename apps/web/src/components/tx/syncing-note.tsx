"use client";

import { NodeDot } from "@/components/item/node-dot";
import { useSubgraphSyncing } from "@/hooks/useSubgraphSync";

/** Shown after a confirmed write until the subgraph catches up; the data comes from the contract meanwhile. */
export function SyncingNote() {
  const syncing = useSubgraphSyncing();
  if (!syncing) return null;
  return (
    <p
      role="status"
      className="inline-flex items-center gap-7 text-caption text-cloud"
    >
      <NodeDot tone="cyan" />
      Syncing…
    </p>
  );
}
