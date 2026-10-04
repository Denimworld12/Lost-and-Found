"use client";

import { CheckIcon, CopyIcon, ExternalLinkIcon } from "lucide-react";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import type { Address } from "viem";
import { AddressChip } from "@/components/item/address-chip";
import { NodeDot } from "@/components/item/node-dot";
import { WalletGate } from "@/components/tx/wallet-gate";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { TxPanel } from "@/components/tx/tx-panel";
import {
  useRoleAccess,
  type AdminWrite,
  type ChainRole,
} from "@/hooks/useAdmin";
import { useLinkedWallet } from "@/hooks/useLinkedWallet";
import { encodeAdminCall, safeAppUrl, type AdminCall } from "@/lib/admin";
import { shortAddress } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Building blocks shared by the admin console tabs. */

export function Field({
  id,
  label,
  required = false,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  required?: boolean;
  hint?: ReactNode;
  error?: string | null;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-7">
      <label htmlFor={id} className="text-body-sm font-semibold text-white">
        {label}
        {required && (
          <>
            <span aria-hidden="true" className="text-cloud">
              {" "}
              *
            </span>
            <span className="sr-only"> (required)</span>
          </>
        )}
      </label>
      {children}
      {hint && !error && (
        <p id={`${id}-hint`} className="text-caption text-cloud">
          {hint}
        </p>
      )}
      {error && (
        <p
          id={`${id}-error`}
          className="flex items-start gap-7 text-body-sm text-snow"
        >
          <NodeDot tone="magenta" className="mt-5" />
          {error}
        </p>
      )}
    </div>
  );
}

/** `aria-describedby` for a Field's control. */
export function describedBy(id: string, error: unknown, hint: boolean) {
  return error ? `${id}-error` : hint ? `${id}-hint` : undefined;
}

export function Note({
  tone = "magenta",
  children,
  className,
}: {
  tone?: "magenta" | "cyan" | "steel" | "green";
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn("flex items-start gap-9 text-body-sm text-snow", className)}
    >
      <NodeDot tone={tone} className="mt-5" />
      <div className="flex min-w-0 flex-col gap-7">{children}</div>
    </div>
  );
}

/** Admin table header cell: Obsidian row, DM Mono 12px uppercase Cloud. */
export function Th({
  children,
  className,
}: {
  children?: ReactNode;
  className?: string;
}) {
  return (
    <th
      scope="col"
      className={cn(
        "px-24 py-12 font-mono text-caption font-normal whitespace-nowrap text-cloud uppercase",
        className,
      )}
    >
      {children}
    </th>
  );
}

export function Pager({
  page,
  pageSize,
  total,
  onPage,
  busy = false,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (page: number) => void;
  busy?: boolean;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  return (
    <nav
      aria-label="Pages"
      className="flex flex-wrap items-center justify-between gap-12"
    >
      <Button
        variant="quiet"
        size="sm"
        disabled={page <= 1 || busy}
        onClick={() => onPage(page - 1)}
      >
        Previous
      </Button>
      <span className="font-mono text-caption text-cloud uppercase tabular">
        Page {page} of {pages}
      </span>
      <Button
        variant="quiet"
        size="sm"
        disabled={page >= pages || busy}
        onClick={() => onPage(page + 1)}
      >
        Next
      </Button>
    </nav>
  );
}

export function CopyButton({
  value,
  label,
}: {
  value: string;
  /** Accessible name, e.g. "Copy calldata". */
  label: string;
}) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
        } catch {
          // Clipboard blocked; the value is on screen to select by hand.
        }
      }}
    >
      {copied ? (
        <CheckIcon aria-hidden="true" />
      ) : (
        <CopyIcon aria-hidden="true" />
      )}
      {copied ? "Copied" : label}
    </Button>
  );
}

// ─────────────────────────────────────────────────────────────── Role gate

/** The connected wallet lacks the on-chain role: say so, and who has it. */
export function RoleNote({
  role,
  account,
  holders,
}: {
  role: ChainRole;
  account: Address;
  holders: Address[];
}) {
  return (
    <Note>
      <p>
        Your wallet{" "}
        <span className="font-mono tabular">{shortAddress(account)}</span>{" "}
        doesn&apos;t hold the {role} role on the contract, so the contract would
        refuse this.
      </p>
      {holders.length > 0 ? (
        <div className="flex flex-col gap-4">
          <p>The {role} role is held by:</p>
          {holders.map((holder) => (
            <AddressChip key={holder} address={holder} />
          ))}
        </div>
      ) : (
        <p>We couldn&apos;t read who holds the {role} role right now.</p>
      )}
      <p className="text-cloud">
        Switch MetaMask to the {role} wallet. It must also be the wallet linked
        to your account.
      </p>
    </Note>
  );
}

/**
 * Renders the write controls once this browser can act with `role`: directly (MetaMask on
 * Sepolia, the linked wallet, holding the role) or through a Safe proposal when a Safe holds
 * the role. Otherwise explains what's missing. UX only: `useTxFlow` re-checks `hasRole` and
 * the contract enforces it.
 */
export function RoleGate({
  role,
  children,
}: {
  role: ChainRole;
  children: (mode: "direct" | "safe") => ReactNode;
}) {
  const access = useRoleAccess(role);
  const linked = useLinkedWallet();

  if (access.kind === "loading")
    return <Skeleton className="h-44 w-240 max-w-full rounded-pill" />;
  if (access.kind === "safe") return <>{children("safe")}</>;
  if (linked.isLoaded && !linked.wallet) {
    return (
      <Note>
        <p>
          Link your MetaMask wallet to your account before you send admin
          transactions.
        </p>
        <Button asChild variant="ghost" size="sm" className="w-fit">
          <Link href="/onboarding">Link a wallet</Link>
        </Button>
      </Note>
    );
  }
  return (
    <WalletGate>
      {access.kind === "missing" ? (
        <RoleNote
          role={role}
          account={access.account}
          holders={access.holders}
        />
      ) : (
        children("direct")
      )}
    </WalletGate>
  );
}

/** Shown instead of a direct write when a Safe holds the role: the call to propose there. */
export function SafeProposal({
  role,
  call,
  onBack,
}: {
  role: ChainRole;
  call: AdminCall;
  onBack: () => void;
}) {
  const access = useRoleAccess(role);
  const tx = encodeAdminCall(call);
  const safe = access.kind === "safe" ? access.safe : null;
  return (
    <div className="flex flex-col gap-16 rounded-card border border-charcoal bg-carbon p-24">
      <p className="font-clash text-body font-medium tracking-clash text-white">
        Propose in Safe
      </p>
      <p className="text-body-sm text-cloud">
        The {role} role is held by a Safe multi-sig, so this change runs once
        enough Safe owners sign it. In Safe, choose New transaction →
        Transaction builder, turn on custom data, and paste these values.
      </p>
      <dl className="flex flex-col gap-12">
        {safe && (
          <div className="flex flex-col gap-4">
            <dt className="font-mono text-caption text-cloud uppercase">
              Safe
            </dt>
            <dd>
              <AddressChip address={safe} full />
            </dd>
          </div>
        )}
        <div className="flex flex-col gap-4">
          <dt className="font-mono text-caption text-cloud uppercase">To</dt>
          <dd>
            <AddressChip address={tx.to} full />
          </dd>
        </div>
        <div className="flex flex-col gap-4">
          <dt className="font-mono text-caption text-cloud uppercase">Value</dt>
          <dd className="font-mono text-body-sm text-snow">0 ETH</dd>
        </div>
        <div className="flex flex-col gap-7">
          <dt className="font-mono text-caption text-cloud uppercase">
            Data ({call.functionName})
          </dt>
          <dd className="rounded-chip bg-obsidian px-12 py-9 font-mono text-caption break-all text-snow">
            {tx.data}
          </dd>
        </div>
      </dl>
      <div className="flex flex-wrap gap-12">
        {safe && (
          <Button asChild>
            <a href={safeAppUrl(safe)} target="_blank" rel="noreferrer">
              Open Safe
              <span className="sr-only"> (opens in a new tab)</span>
              <ExternalLinkIcon aria-hidden="true" />
            </a>
          </Button>
        )}
        <CopyButton value={tx.data} label="Copy data" />
        <Button variant="quiet" onClick={onBack}>
          Back
        </Button>
      </div>
      <p className="text-caption text-cloud">
        The audit log here records transactions sent from this console. Add your
        note to the Safe transaction too.
      </p>
    </div>
  );
}

/** TxPanel for an admin write, then whether its audit log entry saved (with a retry). */
export function AdminTxStatus({
  write,
  title,
  onDone,
}: {
  write: AdminWrite;
  title: string;
  /** Shown as a "Done" button once the entry is saved. */
  onDone?: () => void;
}) {
  const { flow, save } = write;
  return (
    <div className="flex flex-col gap-12">
      <TxPanel
        flow={flow}
        title={title}
        onDismiss={flow.state === "confirmed" ? undefined : write.reset}
      />
      {save?.state === "saving" && (
        <Note tone="cyan">
          <p>Saving to the audit log…</p>
        </Note>
      )}
      {save?.state === "saved" && (
        <Note tone="green">
          <p>Saved to the audit log.</p>
          {onDone && (
            <Button
              variant="ghost"
              size="sm"
              className="w-fit"
              onClick={onDone}
            >
              Done
            </Button>
          )}
        </Note>
      )}
      {save?.state === "failed" && (
        <Note>
          <p>
            The change is on the blockchain, but the audit log entry didn&apos;t
            save: {save.error}
          </p>
          <Button
            variant="ghost"
            size="sm"
            className="w-fit"
            onClick={write.retrySave}
          >
            Save again
          </Button>
        </Note>
      )}
    </div>
  );
}
