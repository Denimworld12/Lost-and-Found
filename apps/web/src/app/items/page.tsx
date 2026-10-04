import type { Metadata } from "next";
import { Suspense } from "react";
import { BrowseItems } from "@/components/item/browse-items";
import { ItemCardSkeleton } from "@/components/item/item-card";

export const metadata: Metadata = {
  title: "Lost items",
  description:
    "Browse lost items on campus and the rewards locked for whoever returns them.",
};

export default function ItemsPage() {
  return (
    <div className="page-x flex flex-col gap-24 py-48">
      <h1 className="text-heading-sm md:text-heading">Lost items</h1>
      <Suspense
        fallback={
          <ul
            aria-label="Loading items"
            className="grid grid-cols-1 gap-24 sm:grid-cols-2 lg:grid-cols-3"
          >
            {[0, 1, 2].map((key) => (
              <li key={key}>
                <ItemCardSkeleton />
              </li>
            ))}
          </ul>
        }
      >
        <BrowseItems />
      </Suspense>
    </div>
  );
}
