import Link from "next/link";
import { cn } from "@/lib/utils";

/** Rhombus outline in white with an orange node dot at its top vertex. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 28 28"
      aria-hidden="true"
      className={cn("size-28 shrink-0", className)}
      fill="none"
    >
      <path
        d="M14 4 25 14 14 24 3 14Z"
        stroke="var(--color-white)"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
      <circle cx="14" cy="4" r="3.5" fill="var(--color-signal-orange)" />
    </svg>
  );
}

/** Logo + wordmark (Clash 600), linking home. */
export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <Link
      href="/"
      className="inline-flex min-h-44 items-center gap-9 rounded-chip"
      aria-label="Campus Lost & Found home"
    >
      <LogoMark />
      <span
        className={cn(
          "font-clash text-body-sm font-semibold tracking-clash whitespace-nowrap text-white uppercase sm:text-body",
          compact && "max-[379px]:sr-only",
        )}
      >
        Campus Lost &amp; Found
      </span>
    </Link>
  );
}
