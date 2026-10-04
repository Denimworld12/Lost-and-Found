import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

/** Pill input on Obsidian. `aria-invalid` gives the 1px Magenta error border. */
function Input({ className, type, ...props }: ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "min-h-44 w-full min-w-0 rounded-pill border border-charcoal bg-obsidian px-24 py-12 text-body text-snow transition-colors placeholder:text-steel disabled:cursor-not-allowed disabled:text-steel aria-invalid:border-node-magenta [&::-webkit-search-cancel-button]:hidden",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
