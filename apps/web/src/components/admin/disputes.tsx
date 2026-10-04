"use client";

import { ExternalLinkIcon } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { isAddressEqual } from "viem";
import { AddressChip } from "@/components/item/address-chip";
import { describeItemEvent } from "@/components/item/item-history";
import { itemTitle } from "@/components/item/item-card";
import { CategoryLabel } from "@/components/item/labels";
import { EmptyState } from "@/components/item/empty-state";
import { LocalTime } from "@/components/item/local-time";
import { EthAmount, RewardAmount } from "@/components/item/reward-amount";
import { ConfirmDialog } from "@/components/tx/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useAdminDisputes, useAdminWrite } from "@/hooks/useAdmin";
import { useItemHistory } from "@/hooks/useItem";
import { useMetadata } from "@/hooks/useMetadata";
import { disputeNoteSchema, NOTE_MAX, type AdminCall } from "@/lib/admin";
import { withHeldDisputes, type AdminDispute } from "@/lib/admin-api";
import { txUrl } from "@/lib/chain";
import { ROLES } from "@/lib/contract";
import { formatDay, formatEth } from "@/lib/format";
import type { ItemEvent } from "@/lib/graph";
import {
  AdminTxStatus,
  describedBy,
  Field,
  RoleGate,
  SafeProposal,
} from "./parts";

/** Disputes tab (docs/UI_SPEC.md → Admin): every Disputed item, oldest first. Admins and arbiters. */
export function Disputes() {
  const disputes = useAdminDisputes();
  const [held, setHeld] = useState<AdminDispute[]>([]);
  const hold = useCallback((dispute: AdminDispute, holding: boolean) => {
    setHeld((current) => {
      const others = current.filter((d) => d.item.id !== dispute.item.id);
      if (holding) return [...others, dispute];
      return others.length === current.length ? current : others;
    });
  }, []);
  const shown = disputes.data ? withHeldDisputes(disputes.data, held) : [];

  return (
    <section aria-labelledby="disputes-title" className="flex flex-col gap-24">
      <div className="flex flex-col gap-9">
        <h2 id="disputes-title" className="text-heading-sm">
          Disputes
          {shown.length > 0 && (
            <span className="text-cloud tabular"> ({shown.length})</span>
          )}
        </h2>
        <p className="text-body text-cloud">
          Email both students and check the history before you decide. Each
          decision needs a note for the audit log.
        </p>
      </div>
      {disputes.isPending ? (
        <DisputeSkeleton />
      ) : disputes.isError ? (
        <EmptyState
          title="We couldn't load the disputes."
          action={
            <Button variant="ghost" onClick={() => disputes.refetch()}>
              Try again
            </Button>
          }
        >
          {disputes.error.message}
        </EmptyState>
      ) : shown.length === 0 ? (
        <EmptyState title="No open disputes." />
      ) : (
        <ul className="flex flex-col gap-24">
          {shown.map((dispute) => (
            <DisputeCard
              key={dispute.item.id.toString()}
              dispute={dispute}
              onHold={hold}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function DisputeSkeleton() {
  return (
    <div
      aria-label="Loading disputes"
      className="flex flex-col gap-16 rounded-card border border-charcoal bg-carbon p-24"
    >
      <Skeleton className="h-28 w-320 max-w-full" />
      <Skeleton className="h-16 w-240 max-w-full" />
      <Skeleton className="h-96 w-full" />
    </div>
  );
}

type Choice = { finderWins: boolean; mode: "direct" | "safe" };

/** One disputed item: parties, details, history, note and the two decisions. */
function DisputeCard({
  dispute,
  onHold,
}: {
  dispute: AdminDispute;
  onHold: (dispute: AdminDispute, holding: boolean) => void;
}) {
  const { item, ownerEmail, finderEmail } = dispute;
  const metadata = useMetadata(item.metadataCID);
  const history = useItemHistory(item.id, item.status);
  const write = useAdminWrite();
  const noteId = useId();
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const [note, setNote] = useState("");
  const [noteError, setNoteError] = useState<string | null>(null);
  const [choice, setChoice] = useState<Choice | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [proposal, setProposal] = useState<AdminCall | null>(null);

  const holding = write.save !== null && write.save.state !== "saved";
  useEffect(() => onHold(dispute, holding), [holding, dispute, onHold]);

  const title = itemTitle(item, metadata.data);
  const events = history.data?.events ?? [];
  const disputed = events.find((event) => event.kind === "Disputed");

  function choose(finderWins: boolean, mode: "direct" | "safe") {
    const parsed = disputeNoteSchema.safeParse(note);
    if (!parsed.success) {
      setNoteError(parsed.error.issues[0]?.message ?? "Write a note.");
      noteRef.current?.focus();
      return;
    }
    setNoteError(null);
    setChoice({ finderWins, mode });
    setDialogOpen(true);
  }

  async function decide() {
    if (!choice) return;
    setDialogOpen(false);
    const { finderWins, mode } = choice;
    if (mode === "safe") {
      setProposal({
        functionName: "resolveDispute",
        args: [item.id, finderWins],
      });
      return;
    }
    // Once the note is saved the list refreshes and this card leaves it.
    await write.run(
      {
        functionName: "resolveDispute",
        args: [item.id, finderWins],
        itemId: item.id,
        successMessage: "Dispute resolved",
        requiredRole: { role: ROLES.arbiter, label: "arbiter" },
      },
      (txHash) => ({
        action: "resolve_dispute",
        txHash,
        itemId: item.id.toString(),
        finderWins,
        note: note.trim(),
      }),
    );
  }

  const locked = write.locked || write.flow.state === "confirmed";

  return (
    <li className="flex flex-col gap-24 rounded-card border border-charcoal bg-carbon p-24">
      <div className="flex flex-col gap-9 sm:flex-row sm:flex-wrap sm:items-baseline sm:justify-between sm:gap-16">
        <h3 className="text-subheading">
          <Link
            href={`/items/${item.id.toString()}`}
            className="hover:underline hover:underline-offset-4"
          >
            <span className="font-mono text-cloud tabular">
              #{item.id.toString()}
            </span>{" "}
            {title}
          </Link>
        </h3>
        <div className="flex flex-wrap items-baseline gap-16 font-mono text-caption text-cloud uppercase">
          <span className="inline-flex items-baseline gap-7">
            Reward <RewardAmount wei={item.reward} exact />
          </span>
          <span className="inline-flex items-baseline gap-7">
            Deposit <EthAmount wei={item.stake} />
          </span>
          {disputed?.timestamp != null && (
            <span className="tabular">
              Disputed{" "}
              <LocalTime seconds={disputed.timestamp} format="datetime" />
            </span>
          )}
        </div>
      </div>

      <dl className="grid gap-16 sm:grid-cols-2">
        <Party
          label="Owner"
          email={ownerEmail}
          address={item.owner}
          openedDispute={
            disputed?.actor ? isAddressEqual(disputed.actor, item.owner) : false
          }
        />
        {item.finder && (
          <Party
            label="Finder"
            email={finderEmail}
            address={item.finder}
            openedDispute={
              disputed?.actor
                ? isAddressEqual(disputed.actor, item.finder)
                : false
            }
          />
        )}
      </dl>

      <div className="flex flex-col gap-9">
        <h4 className="font-mono text-caption text-cloud uppercase">Item</h4>
        {metadata.isPending ? (
          <Skeleton className="h-16 w-240 max-w-full" />
        ) : metadata.data ? (
          <div className="flex flex-col gap-7 text-body-sm text-snow">
            <CategoryLabel category={metadata.data.category} />
            <p>
              Lost at {metadata.data.location} on{" "}
              {formatDay(metadata.data.lostOn)}
            </p>
            {metadata.data.description && (
              <p className="text-cloud">{metadata.data.description}</p>
            )}
          </div>
        ) : (
          <p className="text-body-sm text-cloud">
            Photo and details unavailable right now.
          </p>
        )}
      </div>

      <History
        item={dispute.item}
        events={events}
        pending={history.isPending}
      />

      <div className="flex flex-col gap-16 border-t border-charcoal pt-24">
        <Field
          id={noteId}
          label="Note"
          required
          hint="What you checked and who you spoke to. Saved to the audit log."
          error={noteError}
        >
          <Textarea
            id={noteId}
            ref={noteRef}
            value={note}
            maxLength={NOTE_MAX}
            disabled={locked}
            placeholder="Checked CCTV at the library desk…"
            aria-invalid={noteError ? true : undefined}
            aria-describedby={describedBy(noteId, noteError, true)}
            onChange={(event) => {
              setNote(event.target.value);
              if (noteError) setNoteError(null);
            }}
          />
        </Field>

        {proposal ? (
          <SafeProposal
            role="arbiter"
            call={proposal}
            onBack={() => setProposal(null)}
          />
        ) : write.flow.state !== "idle" ? (
          <AdminTxStatus write={write} title="Resolving the dispute" />
        ) : (
          <RoleGate role="arbiter">
            {(mode) => (
              <div className="flex flex-col gap-12">
                <div className="flex flex-wrap gap-12">
                  <Button variant="ghost" onClick={() => choose(true, mode)}>
                    Pay the finder
                  </Button>
                  <Button variant="ghost" onClick={() => choose(false, mode)}>
                    Return to owner
                  </Button>
                </div>
                {mode === "safe" && (
                  <p className="text-caption text-cloud">
                    The arbiter role is a Safe: each button gives you the
                    transaction to propose there.
                  </p>
                )}
              </div>
            )}
          </RoleGate>
        )}
      </div>

      <ConfirmDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title={choice?.finderWins ? "Pay the finder?" : "Return to owner?"}
        confirmLabel={
          choice?.mode === "safe"
            ? "Propose in Safe"
            : choice?.finderWins
              ? "Pay the finder"
              : "Return to owner"
        }
        onConfirm={decide}
      >
        {choice?.finderWins ? (
          <p>
            The finder gets the {formatEth(item.reward)} reward and their{" "}
            {formatEth(item.stake)} deposit back, and the item is marked
            returned. This can&apos;t be undone.
          </p>
        ) : (
          <p>
            The owner gets the finder&apos;s {formatEth(item.stake)} deposit,
            and the item is listed again with its {formatEth(item.reward)}{" "}
            reward so someone else can claim it. This can&apos;t be undone.
          </p>
        )}
        <p>Your note is saved to the audit log once the change is confirmed.</p>
      </ConfirmDialog>
    </li>
  );
}

function Party({
  label,
  email,
  address,
  openedDispute,
}: {
  label: string;
  email: string | null;
  address: `0x${string}`;
  openedDispute: boolean;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-7 rounded-card border border-charcoal p-16">
      <dt className="flex flex-wrap items-center gap-9 font-mono text-caption text-cloud uppercase">
        {label}
        {openedDispute && <span className="text-snow">Opened the dispute</span>}
      </dt>
      <dd className="flex min-w-0 flex-col gap-4">
        {email ? (
          <a
            href={`mailto:${email}`}
            className="text-body-sm break-all text-snow underline underline-offset-4 hover:text-white"
          >
            {email}
          </a>
        ) : (
          <span className="text-body-sm text-cloud">No email on file</span>
        )}
        <AddressChip address={address} />
      </dd>
    </div>
  );
}

/** The item's events in the order they happened, each linking to Etherscan. */
function History({
  item,
  events,
  pending,
}: {
  item: AdminDispute["item"];
  events: ItemEvent[];
  pending: boolean;
}) {
  const ordered = [...events].reverse();
  return (
    <div className="flex flex-col gap-9">
      <h4 className="font-mono text-caption text-cloud uppercase">History</h4>
      {pending ? (
        <Skeleton className="h-48 w-full" />
      ) : ordered.length === 0 ? (
        <p className="text-body-sm text-cloud">
          History is unavailable right now. The item page links to Etherscan.
        </p>
      ) : (
        <ol className="flex flex-col divide-y divide-charcoal rounded-card border border-charcoal">
          {ordered.map((event) => {
            const link = txUrl(event.txHash);
            return (
              <li
                key={`${event.txHash}-${event.kind}`}
                className="flex flex-col gap-4 px-16 py-12 sm:flex-row sm:items-center sm:justify-between sm:gap-16"
              >
                <span className="text-body-sm text-snow">
                  {describeEvent(event, item)}
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
                      Etherscan
                      <span className="sr-only"> (opens in a new tab)</span>
                      <ExternalLinkIcon aria-hidden="true" />
                    </a>
                  )}
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

/** Like the item page's history, but names the side that opened the dispute. */
function describeEvent(event: ItemEvent, item: AdminDispute["item"]): string {
  if (event.kind === "Disputed" && event.actor) {
    if (isAddressEqual(event.actor, item.owner))
      return "Dispute opened by the owner";
    if (item.finder && isAddressEqual(event.actor, item.finder))
      return "Dispute opened by the finder";
  }
  return describeItemEvent(event);
}
