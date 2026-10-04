"use client";

import { format } from "date-fns";
import { ExternalLinkIcon } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { EmptyState } from "@/components/item/empty-state";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuditLog } from "@/hooks/useAdmin";
import {
  AUDIT_ACTION_LABELS,
  parseConfigTarget,
  WEBHOOK_ACTOR,
  type AuditAction,
} from "@/lib/admin";
import { AUDIT_PAGE_SIZE, type AuditRow } from "@/lib/admin-api";
import { txUrl } from "@/lib/chain";
import { formatDuration, formatEthValue, shortHash } from "@/lib/format";
import { Pager, Th } from "./parts";

/** Audit log tab (admins): every `admin_actions` row, newest first. */
export function AuditLog() {
  const [page, setPage] = useState(1);
  const log = useAuditLog(page);

  return (
    <section aria-labelledby="audit-title" className="flex flex-col gap-24">
      <div className="flex flex-col gap-9">
        <h2 id="audit-title" className="text-heading-sm">
          Audit log
        </h2>
        <p className="text-body text-cloud">
          Every admin and arbiter action, newest first. Contract changes link to
          their transaction.
        </p>
      </div>
      {log.isPending ? (
        <div
          aria-label="Loading the audit log"
          className="flex flex-col gap-16 rounded-card border border-charcoal bg-carbon p-24"
        >
          {[0, 1, 2].map((key) => (
            <Skeleton key={key} className="h-16 w-full" />
          ))}
        </div>
      ) : log.isError ? (
        <EmptyState
          title="We couldn't load the audit log."
          action={
            <Button variant="ghost" onClick={() => log.refetch()}>
              Try again
            </Button>
          }
        >
          {log.error.message}
        </EmptyState>
      ) : log.data.actions.length === 0 ? (
        <EmptyState title="No admin actions yet." />
      ) : (
        <>
          <div
            className="overflow-hidden rounded-card border border-charcoal bg-carbon"
            aria-busy={log.isFetching}
          >
            <table className="w-full text-left">
              <caption className="sr-only">
                Admin actions, newest first. {log.data.total} in total.
              </caption>
              <thead className="hidden bg-obsidian md:table-header-group">
                <tr>
                  <Th>When</Th>
                  <Th>Who</Th>
                  <Th>Action</Th>
                  <Th>Note</Th>
                  <Th>
                    <span className="sr-only">Transaction</span>
                  </Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-charcoal">
                {log.data.actions.map((row) => (
                  <AuditRowView key={row.id} row={row} />
                ))}
              </tbody>
            </table>
          </div>
          <Pager
            page={log.data.page}
            pageSize={AUDIT_PAGE_SIZE}
            total={log.data.total}
            onPage={setPage}
            busy={log.isFetching}
          />
        </>
      )}
    </section>
  );
}

function AuditRowView({ row }: { row: AuditRow }) {
  const link = row.txHash ? txUrl(row.txHash) : null;
  return (
    <tr className="flex flex-col gap-7 px-24 py-16 md:table-row md:p-0">
      <td className="font-mono text-caption whitespace-nowrap text-cloud uppercase tabular md:px-24 md:py-12 md:align-top">
        <time dateTime={row.createdAt}>
          {format(new Date(row.createdAt), "d MMM yyyy, HH:mm")}
        </time>
      </td>
      <td className="min-w-0 text-body-sm break-words text-snow md:px-24 md:py-12 md:align-top">
        {actorLabel(row)}
      </td>
      <td className="flex min-w-0 flex-col gap-4 md:table-cell md:px-24 md:py-12 md:align-top">
        <span className="block text-body-sm text-white">
          {AUDIT_ACTION_LABELS[row.action as AuditAction] ?? row.action}
        </span>
        <span className="block text-caption break-all text-cloud">
          <Target row={row} />
        </span>
      </td>
      <td className="max-w-320 text-body-sm text-snow md:px-24 md:py-12 md:align-top">
        {row.note ? (
          <span className="whitespace-pre-wrap">{row.note}</span>
        ) : (
          <span className="text-cloud">No note</span>
        )}
      </td>
      <td className="md:px-24 md:py-12 md:text-right md:align-top">
        {link && row.txHash && (
          <a
            href={link}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-32 items-center gap-4 font-mono text-caption whitespace-nowrap text-snow tabular hover:text-white [&_svg]:size-12"
          >
            {shortHash(row.txHash)}
            <span className="sr-only"> on Etherscan (opens in a new tab)</span>
            <ExternalLinkIcon aria-hidden="true" />
          </a>
        )}
      </td>
    </tr>
  );
}

function actorLabel(row: AuditRow): string {
  if (row.actorClerkId === WEBHOOK_ACTOR) return "Automatic (account deleted)";
  return row.actorEmail ?? row.actorClerkId;
}

/** What the action was applied to, in words. */
function Target({ row }: { row: AuditRow }) {
  switch (row.action) {
    case "resolve_dispute_finder":
    case "resolve_dispute_owner":
      return (
        <Link
          href={`/items/${row.target}`}
          className="text-snow underline underline-offset-4 hover:text-white"
        >
          Item #{row.target}
        </Link>
      );
    case "set_config": {
      const values = parseConfigTarget(row.target);
      if (!values) return <>{row.target}</>;
      return (
        <>
          Minimum reward {formatEthValue(values.minReward)} ETH · deposit{" "}
          {formatEthValue(values.claimStake)} ETH · window{" "}
          {formatDuration(values.confirmWindow)}
        </>
      );
    }
    case "pause":
    case "unpause":
      return <>Posting and claiming</>;
    default:
      return <>{row.targetEmail ?? row.target}</>;
  }
}
