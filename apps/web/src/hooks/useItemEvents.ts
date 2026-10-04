"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useWatchContractEvent } from "wagmi";
import { toastResult } from "@/components/tx/toast";
import { appChain } from "@/lib/chain";
import { lostAndFound } from "@/lib/contract";
import { ownTxHashes } from "@/lib/tx-flow";

/** What another person's action on this item means, for the live-update toast. */
export const LIVE_EVENT_COPY: Record<string, string> = {
  ItemClaimed: "This item was just claimed.",
  ReturnConfirmed: "The owner just confirmed the return.",
  ClaimRejected: "The claim on this item was just rejected.",
  DisputeRaised: "A dispute was just opened on this item.",
  DisputeResolved: "The security office just resolved the dispute.",
  TimeoutClaimed: "The finder just collected the reward.",
  ItemCancelled: "This listing was just cancelled.",
};

/**
 * Watches the contract for this item's events and refreshes its queries (and balances, which
 * an event may have credited) when one lands.
 * Changes made by someone else also get a toast ("This item was just claimed.").
 */
export function useItemEvents(id: bigint) {
  const queryClient = useQueryClient();
  useWatchContractEvent({
    address: lostAndFound.address,
    abi: lostAndFound.abi,
    chainId: appChain.id,
    onLogs(logs) {
      const mine = logs.filter((log) => {
        const args = (log as { args?: { id?: unknown } }).args;
        return args?.id === id;
      });
      if (mine.length === 0) return;
      // The event may also credit the viewer (balance) or change their dashboard.
      for (const queryKey of [
        ["item", id.toString()],
        ["item-history", id.toString()],
        ["balance"],
        ["me"],
        ["chain-time-offset"],
      ])
        void queryClient.invalidateQueries({ queryKey });
      for (const log of mine) {
        const copy = LIVE_EVENT_COPY[log.eventName];
        if (
          copy &&
          log.transactionHash &&
          !ownTxHashes.has(log.transactionHash)
        )
          toastResult("info", copy);
      }
    },
  });
}
