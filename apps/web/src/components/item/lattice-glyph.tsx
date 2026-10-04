import { cn } from "@/lib/utils";

/** A small lattice fragment: three diamond outlines with one Steel node dot. Decorative. */
export function LatticeGlyph({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 120 64"
      aria-hidden="true"
      className={cn("h-64 w-120", className)}
      fill="none"
    >
      <path
        d="M30 4 56 32 30 60 4 32Z"
        stroke="var(--color-charcoal)"
        strokeWidth="1.5"
      />
      <path
        d="M60 4 86 32 60 60 34 32Z"
        stroke="var(--color-steel)"
        strokeWidth="1.5"
      />
      <path
        d="M90 4 116 32 90 60 64 32Z"
        stroke="var(--color-charcoal)"
        strokeWidth="1.5"
      />
      <circle cx="60" cy="4" r="4" fill="var(--color-steel)" />
    </svg>
  );
}
