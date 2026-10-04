"use client";

import { ExternalLinkIcon } from "lucide-react";
import { NodeDot } from "@/components/item/node-dot";
import type { NodeTone } from "@/components/item/status";
import { Button } from "@/components/ui/button";
import { txUrl } from "@/lib/chain";
import { shortHash } from "@/lib/format";
import type { TxSnapshot, TxStep } from "@/lib/tx-flow";
import { cn } from "@/lib/utils";
import { txRows, type RowState } from "./rows";

const ROW_LABELS: Record<Exclude<TxStep, "prepare">, string> = {
  checking: "Checking",
  awaitingWallet: "Confirm in MetaMask",
  pending: "Pending",
  confirmed: "Done",
};

const ROW_TONE: Record<RowState, NodeTone> = {
  waiting: "steel",
  active: "orange",
  done: "green",
  failed: "magenta",
};

/**
 * Replaces the action buttons while a write runs: CHECKING · CONFIRM IN METAMASK · PENDING ·
 * DONE (plus an optional first row such as "Uploading photo"), each with a node dot. Progress
 * is announced politely; failures show the copy and a way back.
 */
export function TxPanel({
  flow,
  title,
  prepareLabel,
  onDismiss,
  className,
}: {
  flow: TxSnapshot;
  title: string;
  /** Label for a first step that runs before the wallet, e.g. "Uploading photo". */
  prepareLabel?: string;
  onDismiss?: () => void;
  className?: string;
}) {
  const rows = txRows(flow, Boolean(prepareLabel));
  const explorer = flow.hash ? txUrl(flow.hash) : null;
  const stopped = flow.state === "failed" || flow.state === "cancelled";

  return (
    <div
      className={cn(
        "flex flex-col gap-16 rounded-card border border-charcoal bg-carbon p-24",
        className,
      )}
    >
      <p className="font-clash text-body font-medium tracking-clash text-white">
        {title}
      </p>
      <ol aria-live="polite" className="flex flex-col gap-9">
        {rows.map(({ id, state }) => {
          const label = id === "prepare" ? prepareLabel! : ROW_LABELS[id];
          return (
            <li
              key={id}
              aria-current={state === "active" ? "step" : undefined}
              className={cn(
                "flex items-center gap-9 font-mono text-caption uppercase",
                state === "waiting" ? "text-cloud" : "text-snow",
              )}
            >
              <NodeDot tone={ROW_TONE[state]} />
              {label}
              <span className="sr-only">
                {state === "done"
                  ? " (done)"
                  : state === "active"
                    ? " (in progress)"
                    : state === "failed"
                      ? " (stopped)"
                      : ""}
              </span>
            </li>
          );
        })}
      </ol>
      {flow.state === "awaitingWallet" && (
        <p className="text-body-sm text-cloud">
          Check MetaMask and confirm the transaction.
        </p>
      )}
      {explorer && flow.hash && (
        <a
          href={explorer}
          target="_blank"
          rel="noreferrer"
          className="inline-flex w-fit items-center gap-4 font-mono text-body-sm text-snow underline underline-offset-4 hover:text-white"
        >
          <span className="tabular">{shortHash(flow.hash)}</span> View on
          Etherscan
          <ExternalLinkIcon aria-hidden="true" className="size-14" />
          <span className="sr-only"> (opens in a new tab)</span>
        </a>
      )}
      {stopped && flow.error && (
        <p
          role={flow.state === "failed" ? "alert" : "status"}
          className="flex items-start gap-9 text-body-sm text-snow"
        >
          <NodeDot
            tone={flow.state === "failed" ? "magenta" : "steel"}
            className="mt-5"
          />
          <span>{flow.error}</span>
        </p>
      )}
      {stopped && onDismiss && (
        <Button variant="ghost" size="sm" className="w-fit" onClick={onDismiss}>
          Back
        </Button>
      )}
    </div>
  );
}
