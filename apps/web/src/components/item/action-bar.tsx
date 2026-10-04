"use client";

import type { Item } from "@milgaya/shared";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { ConfirmDialog } from "@/components/tx/confirm-dialog";
import { TxPanel } from "@/components/tx/tx-panel";
import { WalletGate } from "@/components/tx/wallet-gate";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useContractConfig } from "@/hooks/useChainData";
import { useTxFlow } from "@/hooks/useTxFlow";
import { getPublicClient, lostAndFound } from "@/lib/contract";
import { CONTRACT_ERROR_MESSAGES } from "@/lib/errors";
import { formatEth } from "@/lib/format";
import {
  planItemActions,
  type ActionNote,
  type ItemAction,
  type ViewerRole,
} from "@/lib/item-actions";
import type { TxRequest } from "@/lib/tx-flow";
import { cn } from "@/lib/utils";
import { NodeDot } from "./node-dot";

/** How long the DONE row stays up before the new actions replace it. */
const DONE_MS = 1_500;

const NOTE_COPY: Record<
  Exclude<ActionNote, "sign-in" | "finish-setup">,
  string
> = {
  claimed: "Someone has claimed this. Waiting for the owner to respond.",
  "awaiting-arbiter":
    "The security office will contact you both by email before deciding.",
  disputed: "The security office is reviewing this claim.",
  cancelled: "Listing cancelled.",
};

const TX_TITLES: Record<ItemAction, string> = {
  claim: "Sending your claim",
  cancel: "Cancelling the listing",
  confirm: "Confirming the return",
  reject: "Rejecting the claim",
  dispute: "Opening a dispute",
  collect: "Collecting the reward",
  withdraw: "Withdrawing to your wallet",
};

function readClaimStake() {
  return getPublicClient().readContract({
    address: lostAndFound.address,
    abi: lostAndFound.abi,
    functionName: "claimStake",
  });
}

/**
 * The item page's buttons for this viewer and status (docs/UI_SPEC.md → ActionBar matrix).
 * While a write runs, a TxPanel takes their place. Sticky above the bottom nav on phones.
 */
export function ActionBar({
  item,
  role,
  chainNow,
  withdrawable,
}: {
  item: Item;
  role: ViewerRole;
  chainNow: bigint | null;
  withdrawable: bigint;
}) {
  const config = useContractConfig();
  const planned = planItemActions(item, role, chainNow, withdrawable);
  // While the admins have paused claiming, "I found this" becomes a note. The contract refuses it too.
  const pausedClaim =
    config.data?.paused === true && planned.actions.includes("claim");
  const plan = pausedClaim
    ? {
        ...planned,
        actions: planned.actions.filter((action) => action !== "claim"),
      }
    : planned;
  // Keep the bar mounted while a write finishes, even if the new status has no actions.
  const [active, setActive] = useState(false);
  if (
    plan.actions.length === 0 &&
    plan.note === null &&
    !pausedClaim &&
    !active
  )
    return null;

  let content: ReactNode;
  if (plan.note === "sign-in") {
    content = (
      <Note
        text="Sign in with your college account to claim this item."
        action={
          <Button asChild>
            <Link
              href={`/sign-in?redirect_url=${encodeURIComponent(`/items/${item.id}`)}`}
            >
              Sign in to claim
            </Link>
          </Button>
        }
      />
    );
  } else if (plan.note === "finish-setup") {
    content = (
      <Note
        text={CONTRACT_ERROR_MESSAGES.NotVerified as string}
        action={
          <Button asChild>
            <Link href="/onboarding">Finish setup to claim</Link>
          </Button>
        }
      />
    );
  } else {
    content = (
      <ItemActions
        item={item}
        actions={plan.actions}
        withdrawable={withdrawable}
        onActiveChange={setActive}
        fallback={
          pausedClaim ? (
            <Note text={CONTRACT_ERROR_MESSAGES.EnforcedPause as string} />
          ) : plan.note ? (
            <Note text={NOTE_COPY[plan.note]} />
          ) : null
        }
      />
    );
  }

  return (
    <div
      className={cn(
        "sticky bottom-[calc(56px+env(safe-area-inset-bottom))] z-30 -mx-16 border-t border-charcoal bg-obsidian px-16 py-16",
        "md:static md:mx-0 md:border-t-0 md:bg-transparent md:p-0",
      )}
    >
      {content}
    </div>
  );
}

/**
 * Buttons for `actions` on one item, behind the wallet checks. While a write runs, a TxPanel
 * takes their place; `fallback` shows when there are no actions. Used by the ActionBar and
 * the dashboard rows.
 */
export function ItemActions({
  item,
  actions,
  withdrawable,
  fallback = null,
  onActiveChange,
}: {
  item: Item;
  actions: ItemAction[];
  withdrawable: bigint;
  fallback?: ReactNode;
  onActiveChange?: (active: boolean) => void;
}) {
  const flow = useTxFlow();
  const [running, setRunning] = useState<ItemAction | null>(null);
  const { state, reset } = flow;
  const active = state !== "idle" && running !== null;

  useEffect(() => {
    onActiveChange?.(active);
  }, [active, onActiveChange]);

  useEffect(() => {
    if (state !== "confirmed") return;
    const timer = setTimeout(reset, DONE_MS);
    return () => clearTimeout(timer);
  }, [state, reset]);

  function start(action: ItemAction, request: Omit<TxRequest, "itemId">) {
    setRunning(action);
    void flow.run({
      ...request,
      itemId: item.id,
      errorContext: {
        windowEndsAt:
          item.claimedAt !== null
            ? item.claimedAt + item.claimWindow
            : undefined,
      },
    });
  }

  if (active) {
    return (
      <TxPanel
        flow={flow}
        title={TX_TITLES[running]}
        onDismiss={reset}
        className="w-full"
      />
    );
  }
  if (actions.length === 0) return <>{fallback}</>;
  return (
    <WalletGate>
      <div className="flex flex-wrap gap-12">
        {actions.map((action) => (
          <ActionButton
            key={action}
            action={action}
            item={item}
            withdrawable={withdrawable}
            onStart={start}
          />
        ))}
      </div>
    </WalletGate>
  );
}

function Note({ text, action }: { text: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col gap-12 sm:flex-row sm:items-center sm:justify-between">
      <p className="flex items-start gap-9 text-body-sm text-snow">
        <NodeDot tone="cyan" className="mt-5" />
        <span>{text}</span>
      </p>
      {action}
    </div>
  );
}

/**
 * One action. Confirm, collect, withdraw and claim are Primary (never two at once); reject and
 * cancel are Danger; a dispute is Ghost so it never competes with the next step.
 */
function ActionButton({
  action,
  item,
  withdrawable,
  onStart,
}: {
  action: ItemAction;
  item: Item;
  withdrawable: bigint;
  onStart: (action: ItemAction, request: Omit<TxRequest, "itemId">) => void;
}) {
  const args = [item.id] as const;

  switch (action) {
    case "claim":
      return <ClaimButton item={item} onStart={onStart} />;
    case "cancel":
      return (
        <ConfirmDialog
          trigger={<Button variant="danger">Cancel listing</Button>}
          title="Cancel this listing?"
          confirmLabel="Cancel listing"
          cancelLabel="Keep listing"
          danger
          onConfirm={() =>
            onStart("cancel", {
              functionName: "cancelItem",
              args,
              successMessage: "Listing cancelled",
            })
          }
        >
          <p>
            Your {formatEth(item.reward)} reward comes back to you as a balance
            you can withdraw. The listing can&apos;t be reopened.
          </p>
        </ConfirmDialog>
      );
    case "confirm":
      return (
        <ConfirmDialog
          trigger={<Button>Confirm it&apos;s returned</Button>}
          title="Did you get it back?"
          confirmLabel="Confirm it's returned"
          cancelLabel="Not yet"
          onConfirm={() =>
            onStart("confirm", {
              functionName: "confirmReturn",
              args,
              successMessage: "Return confirmed",
            })
          }
        >
          <p>
            Only confirm once the item is in your hands. The finder gets the{" "}
            {formatEth(item.reward)} reward and their {formatEth(item.stake)}{" "}
            deposit back. This can&apos;t be undone.
          </p>
        </ConfirmDialog>
      );
    case "reject":
      return (
        <ConfirmDialog
          trigger={<Button variant="danger">Reject claim</Button>}
          title="Reject this claim?"
          confirmLabel="Reject claim"
          cancelLabel="Keep claim"
          danger
          onConfirm={() =>
            onStart("reject", {
              functionName: "rejectClaim",
              args,
              successMessage: "Claim rejected",
            })
          }
        >
          <p>
            Reject only if this person doesn&apos;t have your item. The finder
            loses their {formatEth(item.stake)} deposit: it goes to you, and
            your item is listed again so someone else can claim it.
          </p>
          <p>If you&apos;re not sure, open a dispute instead.</p>
        </ConfirmDialog>
      );
    case "dispute":
      return (
        <ConfirmDialog
          trigger={<Button variant="ghost">Open a dispute</Button>}
          title="Open a dispute?"
          confirmLabel="Open a dispute"
          onConfirm={() =>
            onStart("dispute", {
              functionName: "raiseDispute",
              args,
              successMessage: "Dispute opened",
            })
          }
        >
          <p>
            The campus security office reviews the claim and contacts you both.
            Nothing can change on this item until they decide.
          </p>
          <p>
            They either pay the finder the reward and deposit, or list the item
            again and give the owner the {formatEth(item.stake)} deposit.
          </p>
        </ConfirmDialog>
      );
    case "collect":
      return (
        <Button
          onClick={() =>
            onStart("collect", {
              functionName: "claimAfterTimeout",
              args,
              successMessage: "Reward collected",
            })
          }
        >
          Collect reward
        </Button>
      );
    case "withdraw":
      return (
        <Button
          onClick={() =>
            onStart("withdraw", {
              functionName: "withdraw",
              args: [],
              successMessage: "Withdrawn to your wallet",
            })
          }
        >
          Withdraw {formatEth(withdrawable)}
        </Button>
      );
  }
}

/** "I found this": the dialog reads the current deposit from the contract and claims with it. */
function ClaimButton({
  item,
  onStart,
}: {
  item: Item;
  onStart: (action: ItemAction, request: Omit<TxRequest, "itemId">) => void;
}) {
  const [open, setOpen] = useState(false);
  const stake = useQuery({
    queryKey: ["claim-stake"],
    queryFn: readClaimStake,
    enabled: open,
    staleTime: 0,
  });

  return (
    <ConfirmDialog
      trigger={<Button>I found this</Button>}
      title="Did you find this item?"
      confirmLabel="I found this"
      confirmDisabled={stake.data === undefined}
      onOpenChange={setOpen}
      onConfirm={() => {
        if (stake.data === undefined) return;
        onStart("claim", {
          functionName: "claimItem",
          args: [item.id],
          value: stake.data,
          successMessage: "Claim sent",
        });
      }}
    >
      {stake.isError ? (
        <p role="alert">
          We couldn&apos;t read the deposit from the blockchain. Close this and
          try again.
        </p>
      ) : stake.data === undefined ? (
        <Skeleton className="h-48 w-full" />
      ) : (
        <p>
          You&apos;ll lock a {formatEth(stake.data)} deposit. You get it back
          with the reward when the owner confirms. If the owner rejects your
          claim, the deposit goes to them.
        </p>
      )}
      <p>
        After you claim, you and the owner can see each other&apos;s college
        email to arrange the return.
      </p>
    </ConfirmDialog>
  );
}
