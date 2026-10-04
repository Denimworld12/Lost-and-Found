"use client";

import { formatEthValue } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/**
 * Reward in DM Mono: Signal Orange number, Cloud "ETH". With `exact`, focusing or hovering
 * shows the exact wei amount.
 */
export function RewardAmount({
  wei,
  exact = false,
  className,
}: {
  wei: bigint;
  exact?: boolean;
  className?: string;
}) {
  const value = (
    <span
      className={cn("font-mono text-body whitespace-nowrap tabular", className)}
    >
      <span className="text-signal-orange">{formatEthValue(wei)}</span>{" "}
      <span className="text-cloud">ETH</span>
    </span>
  );
  if (!exact) return value;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="cursor-help rounded-chip"
          aria-label={`${formatEthValue(wei)} ETH, exactly ${wei.toString()} wei`}
        >
          {value}
        </button>
      </TooltipTrigger>
      <TooltipContent className="font-mono tabular">
        {wei.toString()} wei
      </TooltipContent>
    </Tooltip>
  );
}

/** A plain ETH amount in DM Mono (deposits, totals); not highlighted. */
export function EthAmount({
  wei,
  className,
}: {
  wei: bigint;
  className?: string;
}) {
  return (
    <span
      className={cn("font-mono whitespace-nowrap text-snow tabular", className)}
    >
      {formatEthValue(wei)} <span className="text-cloud">ETH</span>
    </span>
  );
}
