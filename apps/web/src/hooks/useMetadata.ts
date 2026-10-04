"use client";

import { useQueries, useQuery } from "@tanstack/react-query";
import { metadataQueryOptions, type ItemMetadata } from "@/lib/ipfs";

/** An item's IPFS metadata. `isError` means it couldn't be loaded; show on-chain facts only. */
export function useMetadata(cid: string | undefined) {
  return useQuery({
    ...metadataQueryOptions(cid ?? ""),
    enabled: Boolean(cid),
  });
}

/** Metadata for many CIDs at once, keyed by CID. `pending` holds the CIDs still loading; the rest are unavailable. */
export function useMetadataMap(cids: string[]): {
  data: Map<string, ItemMetadata>;
  pending: Set<string>;
} {
  return useQueries({
    queries: cids.map((cid) => metadataQueryOptions(cid)),
    combine: (results) => {
      const data = new Map<string, ItemMetadata>();
      const pending = new Set<string>();
      results.forEach((result, index) => {
        if (result.data) data.set(cids[index], result.data);
        if (result.isPending) pending.add(cids[index]);
      });
      return { data, pending };
    },
  });
}
