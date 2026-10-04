import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

/** Textarea: same as Input but with the 8px card radius. */
function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "field-sizing-content min-h-96 w-full rounded-card border border-charcoal bg-obsidian px-24 py-12 text-body text-snow transition-colors placeholder:text-steel disabled:cursor-not-allowed disabled:text-steel aria-invalid:border-node-magenta",
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
