"use client";

import type { Item } from "@milgaya/shared";
import Link from "next/link";
import type { ItemMetadata } from "@/lib/ipfs";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { ItemPhoto } from "./item-photo";
import { CategoryLabel, StatusLabel } from "./labels";
import { LostAgo } from "./local-time";
import { RewardAmount } from "./reward-amount";

export function itemTitle(item: Item, metadata?: ItemMetadata): string {
  return metadata?.title ?? `Item #${item.id.toString()}`;
}

/**
 * ItemCard (docs/UI_SPEC.md): the whole card is one link. Metadata may still be loading
 * (`metadataPending`) or unavailable (neither set), in which case on-chain facts show alone.
 */
export function ItemCard({
  item,
  metadata,
  metadataPending = false,
  priority = false,
  headingLevel = 3,
  photoSrc,
  preview = false,
  className,
}: {
  item: Item;
  metadata?: ItemMetadata;
  metadataPending?: boolean;
  priority?: boolean;
  /** Title heading level: 3 under a section heading (home), 2 directly under the page h1 (browse). */
  headingLevel?: 2 | 3;
  /** Local photo preview (post wizard). */
  photoSrc?: string;
  /** Not posted yet: renders as a plain card, not a link. */
  preview?: boolean;
  className?: string;
}) {
  const title = itemTitle(item, metadata);
  const Heading = headingLevel === 2 ? "h2" : "h3";
  const frame = cn(
    "group flex flex-col gap-16 rounded-card border border-charcoal bg-carbon p-24 transition-colors",
    !preview && "hover:border-steel hover:bg-obsidian",
    item.status === "Cancelled" && "opacity-50",
    className,
  );
  const body = (
    <>
      <div className="flex items-center justify-between gap-12">
        <CategoryLabel category={metadata?.category} />
        <StatusLabel status={item.status} />
      </div>
      {metadataPending ? (
        <Skeleton className="aspect-[4/3] w-full" />
      ) : (
        <ItemPhoto
          image={metadata?.image}
          localSrc={photoSrc}
          alt={title}
          note={metadata ? "No photo" : "Photo unavailable right now"}
          sizes="(min-width: 1024px) 400px, (min-width: 640px) 50vw, 100vw"
          priority={priority}
          dimmed={item.status === "Completed"}
        />
      )}
      <div className="flex min-h-72 flex-col gap-4">
        {metadataPending ? (
          <>
            <Skeleton className="h-24 w-3/4" />
            <Skeleton className="mt-4 h-16 w-1/2" />
          </>
        ) : (
          <>
            <Heading className="line-clamp-2 text-subheading text-white">
              {title}
            </Heading>
            <p className="line-clamp-1 text-body-sm text-cloud">
              {metadata?.location ?? "Details unavailable right now"}
            </p>
          </>
        )}
      </div>
      <div className="mt-auto flex items-end justify-between gap-12 border-t border-charcoal pt-16">
        <div className="flex flex-col gap-4">
          <span className="font-mono text-caption text-cloud uppercase">
            Reward
          </span>
          <RewardAmount wei={item.reward} />
        </div>
        <span className="pb-px text-right font-mono text-caption text-cloud uppercase">
          <LostAgo lostOn={metadata?.lostOn} createdAt={item.createdAt} />
        </span>
      </div>
    </>
  );
  if (preview) return <div className={frame}>{body}</div>;
  return (
    <Link href={`/items/${item.id.toString()}`} className={frame}>
      {body}
    </Link>
  );
}

export function ItemCardSkeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "flex flex-col gap-16 rounded-card border border-charcoal bg-carbon p-24",
        className,
      )}
    >
      <div className="flex justify-between">
        <Skeleton className="h-16 w-96" />
        <Skeleton className="h-16 w-64" />
      </div>
      <Skeleton className="aspect-[4/3] w-full" />
      <div className="flex min-h-72 flex-col gap-4">
        <Skeleton className="h-24 w-3/4" />
        <Skeleton className="mt-4 h-16 w-1/2" />
      </div>
      <div className="flex justify-between border-t border-charcoal pt-16">
        <Skeleton className="h-36 w-96" />
        <Skeleton className="h-16 w-72 self-end" />
      </div>
    </div>
  );
}
