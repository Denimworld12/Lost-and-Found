"use client";

import Link from "next/link";
import { EmptyState } from "@/components/item/empty-state";
import { ItemCard, ItemCardSkeleton } from "@/components/item/item-card";
import { Button } from "@/components/ui/button";
import { useItems } from "@/hooks/useItems";
import { useMetadata } from "@/hooks/useMetadata";
import type { Item } from "@clf/shared";

const scrollRow =
  "-mx-16 flex snap-x snap-mandatory gap-16 overflow-x-auto px-16 pb-4 sm:-mx-24 sm:px-24 md:mx-0 md:grid md:grid-cols-2 md:gap-24 md:overflow-visible md:px-0 lg:grid-cols-4";
const cell = "w-[85%] max-w-320 shrink-0 snap-start md:w-auto md:max-w-none";

function RecentCard({ item }: { item: Item }) {
  const { data, isPending } = useMetadata(item.metadataCID);
  return (
    <li className={cell}>
      <ItemCard
        item={item}
        metadata={data}
        metadataPending={isPending}
        className="h-full"
      />
    </li>
  );
}

/** The four newest Open items; a horizontal row on phones. */
export function RecentItems() {
  const { data, isPending, isError, refetch } = useItems({ status: "Open" });
  const items = data?.items.slice(0, 4) ?? [];

  return (
    <section
      aria-labelledby="recent-title"
      className="page-x flex flex-col gap-24"
    >
      <div className="flex items-end justify-between gap-16">
        <h2 id="recent-title" className="text-heading-sm md:text-heading">
          Recently lost
        </h2>
        <Button asChild variant="ghost" size="sm">
          <Link href="/items">See all items</Link>
        </Button>
      </div>
      {isPending ? (
        <ul aria-label="Loading items" className={scrollRow}>
          {[0, 1, 2, 3].map((key) => (
            <li key={key} className={cell}>
              <ItemCardSkeleton className="h-full" />
            </li>
          ))}
        </ul>
      ) : isError ? (
        <EmptyState
          title="We couldn't reach the blockchain."
          action={
            <Button variant="ghost" onClick={() => refetch()}>
              Try again
            </Button>
          }
        >
          Check your connection, then try again.
        </EmptyState>
      ) : items.length === 0 ? (
        <EmptyState
          title="No open items right now. Lost something?"
          action={
            <Button asChild>
              <Link href="/post">Report lost item</Link>
            </Button>
          }
        >
          Every returned and cancelled item stays public.{" "}
          <Link
            href="/items?status=all"
            className="text-snow underline underline-offset-4 hover:text-white"
          >
            Browse all items
          </Link>
          .
        </EmptyState>
      ) : (
        <ul className={scrollRow}>
          {items.map((item) => (
            <RecentCard key={item.id.toString()} item={item} />
          ))}
        </ul>
      )}
    </section>
  );
}
