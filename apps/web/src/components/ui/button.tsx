import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

/** Buttons per docs/UI_SPEC.md → Buttons. Labels render uppercase; write them in sentence case. */
const buttonVariants = cva(
  "inline-flex shrink-0 cursor-pointer items-center justify-center gap-9 rounded-pill font-clash font-medium tracking-clash whitespace-nowrap uppercase transition-colors select-none disabled:pointer-events-none aria-disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-16",
  {
    variants: {
      variant: {
        primary:
          "bg-signal-orange text-abyss hover:bg-signal-orange-hover disabled:bg-charcoal disabled:text-steel aria-disabled:bg-charcoal aria-disabled:text-steel",
        ghost:
          "bg-transparent text-white shadow-subtle hover:bg-obsidian disabled:text-steel disabled:shadow-none",
        quiet: "bg-transparent text-snow hover:bg-obsidian disabled:text-steel",
        danger:
          "bg-transparent text-white shadow-subtle before:size-8 before:rounded-badge before:bg-node-magenta before:content-[''] hover:bg-obsidian disabled:text-steel",
      },
      size: {
        default: "min-h-44 px-24 py-12 text-body-sm sm:text-body",
        sm: "min-h-36 px-16 py-7 text-body-sm",
        icon: "size-44 p-0",
      },
    },
    defaultVariants: { variant: "primary", size: "default" },
  },
);

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "button";
  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
}

export { Button, buttonVariants };
