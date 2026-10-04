"use client";

import { useUser } from "@clerk/nextjs";
import type { Item } from "@clf/shared";
import { ExternalLinkIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { ItemActions } from "@/components/item/action-bar";
import { describeItemEvent } from "@/components/item/item-history";
import { itemTitle } from "@/components/item/item-card";
import { StatusLabel } from "@/components/item/labels";
import { EmptyState } from "@/components/item/empty-state";
import { LocalTime } from "@/components/item/local-time";
import { NodeDot } from "@/components/item/node-dot";
import { RewardAmount } from "@/components/item/reward-amount";
import { WithdrawAction } from "@/components/tx/withdraw-action";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useMetadata } from "@/hooks/useMetadata";
import { useMyHistory, useNeeds } from "@/hooks/useMyItems";
import { txUrl } from "@/lib/chain";
import { sortForDashboard, type Need } from "@/lib/dashboard";
import { countdown, formatEth, formatEthValue } from "@/lib/format";
import type { UserActivity } from "@/lib/graph";

/**
 * My dashboard (docs/UI_SPEC.md → My dashboard): withdrawable balance and four tabs, all read
 * from the chain for the wallet linked to this account.
 */
export function Dashboard() {
  const { user } = useUser();
  const { wallet, items, withdrawable, chainNow, needs } = useNeeds();
  const lost = items.data ? sortForDashboard(items.data.lost) : [];
  const found = items.data ? sortForDashboard(items.data.found) : [];
  const balance = withdrawable.data ?? 0n;

  return (
    <div className="flex flex-col gap-32">
      <div className="flex flex-col gap-24 md:flex-row md:items-start md:justify-between">
        <div className="flex flex-col gap-9">
          <h1 className="text-heading-sm md:text-heading">
            {user?.firstName ? `Hi ${user.firstName}` : "My items"}
          </h1>
          <p className="text-body text-cloud">
            Your reports, claims and payouts on Sepolia.
          </p>
        </div>
        <section
          aria-labelledby="balance-title"
          className="flex flex-col gap-12 rounded-card border border-charcoal bg-carbon p-24 md:min-w-320"
        >
          <h2
            id="balance-title"
            className="font-mono text-caption text-cloud uppercase"
          >
            Available to withdraw
          </h2>
          {withdrawable.isPending ? (
            <Skeleton className="h-28 w-120" />
          ) : (
            <RewardAmount wei={balance} exact className="text-subheading" />
          )}
          {balance > 0n ? (
            <WithdrawAction amount={balance} />
          ) : (
            <p className="text-body-sm text-cloud">
              Rewards and deposits you&apos;re owed show here.
            </p>
          )}
        </section>
      </div>

      {!wallet ? (
        <EmptyState
          title="Link your wallet to see your items."
          action={
            <Button asChild>
              <Link href="/onboarding">Continue setup</Link>
            </Button>
          }
        />
      ) : items.isError ? (
        <EmptyState
          title="We couldn't load your items."
          action={
            <Button variant="ghost" onClick={() => items.refetch()}>
              Try again
            </Button>
          }
        >
          The blockchain didn&apos;t answer. Check your connection.
        </EmptyState>
      ) : (
        <Tabs defaultValue="action">
          <TabsList aria-label="My items">
            <TabsTrigger value="action">
              Needs your action
              {needs.length > 0 && (
                <span className="tabular">({needs.length})</span>
              )}
            </TabsTrigger>
            <TabsTrigger value="lost">Items I lost</TabsTrigger>
            <TabsTrigger value="found">Items I found</TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
          </TabsList>

          <TabsContent value="action">
            {items.isPending ? (
              <RowsSkeleton />
            ) : needs.length === 0 ? (
              <EmptyState
                title="Nothing needs your action right now."
                action={
                  <Button asChild variant="ghost">
                    <Link href="/items">Browse items</Link>
                  </Button>
                }
              />
            ) : (
              <Rows>
                {needs.map((need) => (
                  <NeedRow
                    key={`${need.kind}-${need.item?.id ?? "balance"}`}
                    need={need}
                    chainNow={chainNow}
                    withdrawable={balance}
                  />
                ))}
              </Rows>
            )}
          </TabsContent>

          <TabsContent value="lost">
            {items.isPending ? (
              <RowsSkeleton />
            ) : lost.length === 0 ? (
              <EmptyState
                title="You haven't reported anything."
                action={
                  <Button asChild>
                    <Link href="/post">Report lost item</Link>
                  </Button>
                }
              />
            ) : (
              <Rows>
                {lost.map((item) => (
                  <ItemRow key={item.id.toString()} item={item} />
                ))}
              </Rows>
            )}
          </TabsContent>

          <TabsContent value="found">
            {items.isPending ? (
              <RowsSkeleton />
            ) : found.length === 0 ? (
              <EmptyState
                title="You haven't claimed anything yet."
                action={
                  <Button asChild variant="ghost">
                    <Link href="/items">Browse items</Link>
                  </Button>
                }
              >
                Found something on campus? Find its listing and claim it.
              </EmptyState>
            ) : (
              <Rows>
                {found.map((item) => (
                  <ItemRow key={item.id.toString()} item={item} />
                ))}
              </Rows>
            )}
          </TabsContent>

          <TabsContent value="history">
            <HistoryTab
              wallet={wallet}
              itemIds={
                items.data
                  ? [...items.data.lost, ...items.data.found].map(
                      (item) => item.id,
                    )
                  : undefined
              }
            />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

function Rows({ children }: { children: ReactNode }) {
  return <ul className="flex flex-col gap-12">{children}</ul>;
}

function RowsSkeleton() {
  return (
    <ul aria-label="Loading" className="flex flex-col gap-12">
      {[0, 1].map((key) => (
        <li
          key={key}
          className="flex flex-col gap-9 rounded-card border border-charcoal bg-carbon p-24"
        >
          <Skeleton className="h-16 w-96" />
          <Skeleton className="h-24 w-240 max-w-full" />
        </li>
      ))}
    </ul>
  );
}

function RowFrame({ children }: { children: ReactNode }) {
  return (
    <li className="flex flex-col gap-12 rounded-card border border-charcoal bg-carbon p-24">
      {children}
    </li>
  );
}

function ViewItem({ id }: { id: bigint }) {
  return (
    <Button asChild variant="quiet">
      <Link href={`/items/${id.toString()}`}>View item</Link>
    </Button>
  );
}

/** One "Needs your action" row: what happened, then the one relevant button. */
function NeedRow({
  need,
  chainNow,
  withdrawable,
}: {
  need: Need;
  chainNow: bigint | null;
  withdrawable: bigint;
}) {
  const { data: metadata } = useMetadata(need.item?.metadataCID);
  if (need.kind === "withdraw" || !need.item) {
    return (
      <RowFrame>
        <p className="flex items-center gap-9 text-body text-snow">
          <NodeDot tone="green" />
          You have {formatEth(withdrawable)} to withdraw.
        </p>
        <WithdrawAction amount={withdrawable} />
      </RowFrame>
    );
  }
  const item = need.item;
  const title = itemTitle(item, metadata);
  const left =
    item.claimedAt !== null && chainNow !== null
      ? countdown(item.claimedAt + item.claimWindow, chainNow)
      : null;

  let message: string;
  switch (need.kind) {
    case "respond":
      message = left
        ? `Someone claimed your ${title}. ${left} to respond.`
        : `Someone claimed your ${title}. The response window has ended, but you can still confirm the return.`;
      break;
    case "collect":
      message = `The owner of ${title} didn't respond in time. Collect your reward.`;
      break;
    case "dispute":
      message = `${title} is in a dispute. The security office will contact you.`;
      break;
  }

  return (
    <RowFrame>
      <StatusLabel status={item.status} />
      <p className="text-body text-snow">{message}</p>
      <div className="flex flex-wrap items-center gap-12">
        {need.kind === "respond" && (
          <ItemActions item={item} actions={["confirm"]} withdrawable={0n} />
        )}
        {need.kind === "collect" && (
          <ItemActions item={item} actions={["collect"]} withdrawable={0n} />
        )}
        <ViewItem id={item.id} />
      </div>
    </RowFrame>
  );
}

function ItemRow({ item }: { item: Item }) {
  const { data: metadata, isPending } = useMetadata(item.metadataCID);
  return (
    <RowFrame>
      <div className="flex flex-wrap items-center justify-between gap-12">
        <StatusLabel status={item.status} />
        <span className="font-mono text-caption text-cloud uppercase">
          Posted <LocalTime seconds={item.createdAt} format="relative" />
        </span>
      </div>
      {isPending ? (
        <Skeleton className="h-24 w-240 max-w-full" />
      ) : (
        <p className="font-clash text-subheading font-medium tracking-clash break-words text-white">
          {itemTitle(item, metadata)}
        </p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-12">
        <span className="flex items-center gap-9">
          <span className="font-mono text-caption text-cloud uppercase">
            Reward
          </span>
          <RewardAmount wei={item.reward} />
        </span>
        <ViewItem id={item.id} />
      </div>
    </RowFrame>
  );
}

function describeActivity(activity: UserActivity): string {
  if (activity.kind === "Withdrawn") {
    return `Withdrew ${activity.amount !== null ? formatEthValue(activity.amount) : ""} ETH to your wallet`;
  }
  return describeItemEvent({
    kind: activity.kind,
    actor: activity.actor,
    amount: activity.amount,
    finderWins: activity.finderWins,
    txHash: activity.txHash,
    timestamp: activity.timestamp,
  });
}

function HistoryTab({
  wallet,
  itemIds,
}: {
  wallet: `0x${string}`;
  itemIds: bigint[] | undefined;
}) {
  const history = useMyHistory(wallet, itemIds);
  if (history.isPending) return <RowsSkeleton />;
  if (history.isError) {
    return (
      <EmptyState
        title="History is unavailable right now."
        action={
          <Button variant="ghost" onClick={() => history.refetch()}>
            Try again
          </Button>
        }
      />
    );
  }
  if (history.data.events.length === 0) {
    return (
      <EmptyState
        title="No activity yet."
        action={
          <Button asChild>
            <Link href="/post">Report lost item</Link>
          </Button>
        }
      >
        Posts, claims and payouts will show here.
      </EmptyState>
    );
  }
  return (
    <ol className="flex flex-col divide-y divide-charcoal rounded-card border border-charcoal bg-carbon">
      {history.data.events.map((activity) => {
        const explorer = txUrl(activity.txHash);
        return (
          <li
            key={`${activity.txHash}-${activity.kind}-${activity.itemId ?? ""}`}
            className="flex flex-col gap-4 px-24 py-16 sm:flex-row sm:items-baseline sm:justify-between sm:gap-16"
          >
            <span className="text-body-sm text-snow">
              {activity.itemId !== null && (
                <Link
                  href={`/items/${activity.itemId.toString()}`}
                  className="font-mono text-cloud underline underline-offset-4 hover:text-white"
                >
                  #{activity.itemId.toString()}
                </Link>
              )}{" "}
              {describeActivity(activity)}
            </span>
            <span className="flex shrink-0 items-center gap-12 font-mono text-caption text-cloud">
              {activity.timestamp !== null && (
                <LocalTime seconds={activity.timestamp} format="datetime" />
              )}
              {explorer && (
                <a
                  href={explorer}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-4 text-snow underline underline-offset-4 hover:text-white"
                >
                  Etherscan
                  <ExternalLinkIcon aria-hidden="true" className="size-12" />
                  <span className="sr-only"> (opens in a new tab)</span>
                </a>
              )}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
