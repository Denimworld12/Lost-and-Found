"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useItems } from "@/hooks/useItems";
import { useMetadataMap } from "@/hooks/useMetadata";
import { Lattice } from "./Lattice";
import { TrustStrip } from "./trust-strip";

/** Home hero: headline left, live lattice of Open items right (below the text on phones). */
export function HomeHero() {
  const { data } = useItems({ status: "Open" });
  const items = data?.items ?? [];
  const { data: metadata } = useMetadataMap(
    items.slice(0, 24).map((item) => item.metadataCID),
  );

  return (
    <section
      aria-labelledby="hero-title"
      className="page-x grid items-center gap-32 py-48 lg:grid-cols-2 lg:gap-48 lg:py-64"
    >
      <div className="flex max-w-600 flex-col gap-24">
        <h1
          id="hero-title"
          className="text-display-mobile font-semibold text-white md:text-display"
        >
          Lost something on campus?
        </h1>
        <p className="text-body-lg text-snow">
          Post it with a reward. The reward stays locked until you get it back.
        </p>
        <div className="flex flex-wrap gap-12">
          <Button asChild>
            <Link href="/post">Report lost item</Link>
          </Button>
          <Button asChild variant="ghost">
            <Link href="/items">Browse items</Link>
          </Button>
        </div>
        <TrustStrip />
      </div>
      <Lattice items={items} metadata={metadata} />
    </section>
  );
}
