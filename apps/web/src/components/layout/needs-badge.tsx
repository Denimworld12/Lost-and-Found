"use client";

import { useAuth } from "@clerk/nextjs";
import { useNeeds } from "@/hooks/useMyItems";
import { cn } from "@/lib/utils";

/** Count of dashboard items needing the signed-in student's action; 0 when signed out. */
export function useNeedsCount(): number {
  const { isSignedIn } = useAuth();
  const { needs } = useNeeds();
  return isSignedIn ? needs.length : 0;
}

/** Small count pill next to "Me" / "My items". Nothing when the count is 0. */
export function NeedsBadge({
  count,
  className,
}: {
  count: number;
  className?: string;
}) {
  if (count === 0) return null;
  return (
    <span
      className={cn(
        "inline-flex min-w-20 items-center justify-center rounded-badge border border-steel bg-obsidian px-5 font-mono text-caption leading-none text-white tabular",
        className,
      )}
    >
      {count}
      <span className="sr-only"> need{count === 1 ? "s" : ""} your action</span>
    </span>
  );
}
