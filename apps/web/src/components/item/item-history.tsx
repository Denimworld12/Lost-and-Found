"use client";

import { ExternalLinkIcon } from "lucide-react";
import { useItemHistory } from "@/hooks/useItem";
import { eventsUrl, txUrl } from "@/lib/chain";
import { lostAndFound } from "@/lib/contract";
import { formatEthValue, shortAddress } from "@/lib/format";
import type { ItemEvent } from "@/lib/graph";
import { Skeleton } from "@/components/ui/skeleton";
import { LocalTime } from "./local-time";

export function describeItemEvent(event: ItemEvent): string {
  const who = event.actor ? shortAddress(event.actor) : "someone";
  const amount =
    event.amount !== null ? `${formatEthValue(event.amount)} ETH` : "";
  switch (event.kind) {
    case "Posted":
      return `Posted with ${amount} reward`;
    case "Claimed":
      return `Claimed by ${who} with ${amount} deposit`;
    case "Confirmed":
      return `Return confirmed, ${amount} paid to the finder`;
    case "Rejected":
      return `Claim rejected, ${amount} deposit to the owner`;
    case "Disputed":
      return `Dispute opened by ${who}`;
    case "Resolved":
      return event.finderWins
        ? "Dispute resolved: finder paid"
        : "Dispute resolved: returned to owner";
    case "TimeoutClaimed":
      return `Reward collected by ${who} after the window, ${amount}`;
    case "Cancelled":
      return "Listing cancelled, reward returned to the owner";
  }
}

/** History from the item's contract events, newest first, each linking to Etherscan. */
export function ItemHistory({ id, status }: { id: bigint; status: string }) {
  const { data, isPending, isError } = useItemHistory(id, status);
  const allEvents = eventsUrl(lostAndFound.address);

  return (
    <section aria-labelledby="history-title" className="flex flex-col gap-16">
      <h2 id="history-title" className="text-subheading">
        History
      </h2>
      {isPending ? (
        <ul
          aria-label="Loading history"
          className="flex flex-col divide-y divide-charcoal rounded-card border border-charcoal bg-carbon"
        >
          {[0, 1].map((key) => (
            <li
              key={key}
              className="flex flex-col gap-9 px-24 py-16 sm:flex-row sm:justify-between"
            >
              <Skeleton className="h-16 w-240 max-w-full" />
              <Skeleton className="h-16 w-120" />
            </li>
          ))}
        </ul>
      ) : isError || !data || data.events.length === 0 ? (
        <p className="rounded-card border border-charcoal bg-carbon px-24 py-16 text-body-sm text-cloud">
          History is unavailable right now.{" "}
          {allEvents && (
            <a
              href={allEvents}
              target="_blank"
              rel="noreferrer"
              className="text-snow underline underline-offset-4 hover:text-white"
            >
              See every contract event on Etherscan
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          )}
        </p>
      ) : (
        <>
          <ol className="flex flex-col divide-y divide-charcoal rounded-card border border-charcoal bg-carbon">
            {data.events.map((event) => {
              const link = txUrl(event.txHash);
              return (
                <li
                  key={`${event.txHash}-${event.kind}`}
                  className="flex flex-col gap-4 px-24 py-16 sm:flex-row sm:items-center sm:justify-between sm:gap-16"
                >
                  <span className="text-body-sm text-snow">
                    {describeItemEvent(event)}
                  </span>
                  <span className="flex items-center gap-16 font-mono text-caption text-cloud uppercase tabular">
                    {event.timestamp !== null && (
                      <LocalTime seconds={event.timestamp} format="datetime" />
                    )}
                    {link && (
                      <a
                        href={link}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex min-h-32 items-center gap-4 text-snow hover:text-white [&_svg]:size-12"
                      >
                        View on Etherscan
                        <span className="sr-only"> (opens in a new tab)</span>
                        <ExternalLinkIcon aria-hidden="true" />
                      </a>
                    )}
                  </span>
                </li>
              );
            })}
          </ol>
          {!data.complete && (
            <p className="text-caption text-cloud">
              Older events couldn&apos;t be loaded. Etherscan has the full
              record.
            </p>
          )}
        </>
      )}
    </section>
  );
}
