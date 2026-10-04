import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

/** Pill badge: Obsidian, 1px Steel border, DM Mono 12px uppercase (docs/UI_SPEC.md → StatusBadge). */
function Badge({ className, ...props }: ComponentProps<"span">) {
  return (
    <span
      data-slot="badge"
      className={cn(
        "inline-flex w-fit shrink-0 items-center gap-7 rounded-badge border border-steel bg-obsidian px-12 py-4 font-mono text-caption whitespace-nowrap text-snow uppercase",
        className,
      )}
      {...props}
    />
  );
}

export { Badge };
