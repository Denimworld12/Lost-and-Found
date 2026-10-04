"use client";

import { NodeDot } from "@/components/item/node-dot";
import { Skeleton } from "@/components/ui/skeleton";
import { useStats } from "@/hooks/useChainData";
import { isLocalChain } from "@/lib/chain";
import { formatEthValue } from "@/lib/format";

/** DM Mono trust strip under the hero: escrow network, items returned, rewards paid. */
export function TrustStrip() {
  const { data: stats, isPending, isError } = useStats();
  const facts: string[] = [
    isLocalChain ? "Escrow on a local chain" : "Escrow on Sepolia",
  ];
  if (stats) {
    const prefix = stats.partial ? "Latest 50: " : "";
    facts.push(`${prefix}${stats.itemsReturned.toString()} returned`);
    facts.push(`${formatEthValue(stats.totalRewardsPaid)} ETH paid`);
  }
  return (
    <ul className="flex flex-wrap gap-x-24 gap-y-9" aria-busy={isPending}>
      {facts.map((fact, index) => (
        <li
          key={fact}
          className="inline-flex items-center gap-7 font-mono text-caption text-cloud uppercase tabular"
        >
          <NodeDot tone={index === 0 ? "cyan" : "green"} />
          {fact}
        </li>
      ))}
      {isPending && (
        <>
          <li>
            <Skeleton className="h-16 w-96" />
          </li>
          <li>
            <Skeleton className="h-16 w-96" />
          </li>
        </>
      )}
      {isError && (
        <li className="inline-flex items-center gap-7 font-mono text-caption text-cloud uppercase">
          <NodeDot tone="steel" />
          Totals unavailable right now
        </li>
      )}
    </ul>
  );
}
