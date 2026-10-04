"use client";

import { useEffect } from "react";
import { LatticeGlyph } from "@/components/item/lattice-glyph";
import { Button } from "@/components/ui/button";

export default function ErrorPage({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    // Sentry reporting arrives in Phase 10; until then the error goes to the console.
    console.error(error);
  }, [error]);

  return (
    <div className="page-x flex flex-1 flex-col items-start justify-center gap-24 py-64">
      <LatticeGlyph />
      <h1 className="max-w-640 text-heading-sm md:text-heading">
        Something went wrong loading this page.
      </h1>
      <p className="max-w-560 text-body-lg text-snow">
        The blockchain connection may be busy. Try again in a moment.
      </p>
      {error.digest && (
        <p className="font-mono text-caption text-cloud">
          Reference {error.digest}
        </p>
      )}
      <Button onClick={() => retry()}>Try again</Button>
    </div>
  );
}
