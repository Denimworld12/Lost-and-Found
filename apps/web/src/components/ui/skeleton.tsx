import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

/** Charcoal placeholder block; pulses only when the visitor allows motion. */
function Skeleton({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden="true"
      className={cn(
        "rounded-chip bg-charcoal motion-safe:animate-pulse",
        className,
      )}
      {...props}
    />
  );
}

export { Skeleton };
