import type { Metadata } from "next";
import Link from "next/link";
import { LatticeGlyph } from "@/components/item/lattice-glyph";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Page not found" };

export default function NotFound() {
  return (
    <div className="page-x flex flex-1 flex-col items-start justify-center gap-24 py-64">
      <LatticeGlyph />
      <p className="font-mono text-caption text-cloud uppercase">Error 404</p>
      <h1 className="max-w-640 text-heading-sm md:text-heading">
        We couldn&apos;t find that page.
      </h1>
      <p className="max-w-560 text-body-lg text-snow">
        It may have been moved, or the link is wrong.
      </p>
      <Button asChild>
        <Link href="/items">Browse items</Link>
      </Button>
    </div>
  );
}
