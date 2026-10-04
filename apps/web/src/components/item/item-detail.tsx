"use client";

import { useAuth } from "@clerk/nextjs";
import type { Item } from "@clf/shared";
import { ArrowLeftIcon } from "lucide-react";
import { isAddressEqual, type Address } from "viem";
import Link from "next/link";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useChainTime } from "@/hooks/useChainData";
import { useItem } from "@/hooks/useItem";
import { useItemEvents } from "@/hooks/useItemEvents";
import { useLinkedWallet } from "@/hooks/useLinkedWallet";
import { useMetadata } from "@/hooks/useMetadata";
import { useIsVerified, useWithdrawable } from "@/hooks/useWallet";
import { formatDay } from "@/lib/format";
import { viewerRole, type ViewerRole } from "@/lib/item-actions";
import { ActionBar } from "./action-bar";
import { AddressChip } from "./address-chip";
import { ContactCard } from "./contact-card";
import { Countdown } from "./countdown";
import { itemTitle } from "./item-card";
import { ItemHistory } from "./item-history";
import { ItemPhoto } from "./item-photo";
import { CategoryLabel } from "./labels";
import { LocalTime } from "./local-time";
import { EthAmount, RewardAmount } from "./reward-amount";
import { StatusPanel } from "./status-panel";

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-baseline sm:gap-16">
      <dt className="shrink-0 font-mono text-caption text-cloud uppercase sm:w-120">
        {label}
      </dt>
      <dd className="min-w-0 text-body text-snow">{children}</dd>
    </div>
  );
}

/** Who the viewer is for this item; `null` until Clerk and the on-chain check have loaded. */
function useViewerRole(item: Item): ViewerRole | null {
  const { isLoaded, isSignedIn } = useAuth();
  const { wallet: linkedWallet } = useLinkedWallet();
  const verified = useIsVerified(linkedWallet);
  if (!isLoaded) return null;
  if (isSignedIn && linkedWallet && verified.isPending) return null;
  return viewerRole(item, {
    signedIn: Boolean(isSignedIn),
    linkedWallet,
    verifiedWallet: verified.data ? linkedWallet : null,
  });
}

function isYou(address: Address, wallet: Address | null): boolean {
  return wallet !== null && isAddressEqual(address, wallet);
}

/**
 * Item page body: photo, status, on-chain facts, metadata, the viewer's actions, contact
 * details after a claim, and history. Contract events for this item refresh it live.
 */
export function ItemDetail({ initialItem }: { initialItem: Item }) {
  const { data } = useItem(initialItem.id, initialItem);
  const item = data ?? initialItem;
  useItemEvents(item.id);
  const role = useViewerRole(item);
  const { wallet: linkedWallet } = useLinkedWallet();
  const withdrawable = useWithdrawable(linkedWallet);
  const chainNow = useChainTime(15_000);
  const {
    data: metadata,
    isPending: metadataPending,
    isError: metadataError,
  } = useMetadata(item.metadataCID);
  const title = itemTitle(item, metadata);

  return (
    <div className="page-x flex flex-col gap-32 py-32 md:py-48">
      <Button asChild variant="quiet" size="sm" className="-ml-16 w-fit">
        <Link href="/items">
          <ArrowLeftIcon aria-hidden="true" />
          Back to items
        </Link>
      </Button>

      <div className="grid gap-32 md:grid-cols-2 md:gap-48">
        <div className="flex flex-col gap-12">
          {metadataPending ? (
            <Skeleton className="aspect-[4/3] w-full" />
          ) : (
            <ItemPhoto
              image={metadata?.image}
              alt={title}
              note={metadata ? "No photo for this item" : "Photo unavailable"}
              sizes="(min-width: 768px) 50vw, 100vw"
              priority
              dimmed={item.status === "Completed"}
            />
          )}
        </div>

        <div className="flex flex-col gap-24">
          <div className="flex flex-col gap-12">
            <CategoryLabel category={metadata?.category} />
            {metadataPending ? (
              <Skeleton className="h-36 w-3/4" />
            ) : (
              <h1 className="text-heading-sm break-words md:text-heading">
                {title}
              </h1>
            )}
          </div>

          <StatusPanel id={item.id} status={item.status} />

          {metadataError && (
            <p role="status" className="text-body-sm text-cloud">
              Photo and details unavailable right now. The facts below come
              straight from the blockchain.
            </p>
          )}

          <dl className="flex flex-col gap-16">
            <Fact label="Reward">
              <RewardAmount wei={item.reward} exact />
            </Fact>
            <Fact label="Deposit">
              {item.finder ? (
                <EthAmount wei={item.stake} />
              ) : (
                <span className="text-cloud">Set when someone claims it</span>
              )}
            </Fact>
            {metadataPending ? (
              <>
                <Skeleton className="h-20 w-2/3" />
                <Skeleton className="h-20 w-1/2" />
              </>
            ) : (
              metadata && (
                <>
                  <Fact label="Lost at">{metadata.location}</Fact>
                  <Fact label="Lost on">{formatDay(metadata.lostOn)}</Fact>
                  {metadata.description && (
                    <Fact label="Details">{metadata.description}</Fact>
                  )}
                </>
              )
            )}
            <Fact label="Posted by">
              <AddressChip
                address={item.owner}
                isYou={isYou(item.owner, linkedWallet)}
              />
            </Fact>
            <Fact label="Posted">
              <LocalTime seconds={item.createdAt} format="datetime" />
            </Fact>
            {item.finder && (
              <Fact label="Claimed by">
                <AddressChip
                  address={item.finder}
                  isYou={isYou(item.finder, linkedWallet)}
                />
              </Fact>
            )}
            {item.status === "Claimed" && item.claimedAt !== null && (
              <Fact label="Time left">
                <Countdown endsAt={item.claimedAt + item.claimWindow} />
              </Fact>
            )}
          </dl>

          {role === null ? (
            <Skeleton className="h-44 w-200 rounded-pill" />
          ) : (
            <ActionBar
              item={item}
              role={role}
              chainNow={chainNow}
              withdrawable={withdrawable.data ?? 0n}
            />
          )}
          {role && <ContactCard item={item} role={role} />}
        </div>
      </div>

      <ItemHistory id={item.id} status={item.status} />
    </div>
  );
}
