"use client";

import { useChainTime } from "@/hooks/useChainData";
import { countdown } from "@/lib/format";
import { NodeDot } from "./node-dot";

/**
 * Time left in the confirm window, in DM Mono with a Node Violet dot. Measured against the
 * latest block time, not the device clock. Shows minutes under an hour.
 */
export function Countdown({ endsAt }: { endsAt: bigint }) {
  const now = useChainTime(15_000);
  if (now === null) {
    return (
      <span className="font-mono text-caption text-cloud uppercase">
        Checking time left…
      </span>
    );
  }
  const left = countdown(endsAt, now);
  return (
    <span className="inline-flex items-center gap-7 font-mono text-caption text-snow uppercase tabular">
      <NodeDot tone="violet" />
      {left ? `${left} to respond` : "Response window has ended"}
    </span>
  );
}
