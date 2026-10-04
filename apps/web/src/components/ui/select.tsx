"use client";

import { CheckIcon, ChevronDownIcon } from "lucide-react";
import { Select as SelectPrimitive } from "radix-ui";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

const popoverClass =
  "z-50 overflow-hidden rounded-card border border-charcoal bg-carbon text-snow motion-safe:data-[state=open]:animate-in motion-safe:data-[state=open]:fade-in-0 motion-safe:data-[state=closed]:animate-out motion-safe:data-[state=closed]:fade-out-0";

const itemClass =
  "relative flex min-h-44 w-full cursor-pointer items-center gap-9 rounded-chip py-9 pr-36 pl-12 text-body-sm text-snow outline-none select-none data-[disabled]:pointer-events-none data-[disabled]:text-steel data-[highlighted]:bg-obsidian data-[highlighted]:text-white";

function Select(props: ComponentProps<typeof SelectPrimitive.Root>) {
  return <SelectPrimitive.Root data-slot="select" {...props} />;
}

function SelectGroup(props: ComponentProps<typeof SelectPrimitive.Group>) {
  return <SelectPrimitive.Group data-slot="select-group" {...props} />;
}

function SelectValue(props: ComponentProps<typeof SelectPrimitive.Value>) {
  return <SelectPrimitive.Value data-slot="select-value" {...props} />;
}

/** Obsidian pill trigger with a chevron. */
function SelectTrigger({
  className,
  children,
  ...props
}: ComponentProps<typeof SelectPrimitive.Trigger>) {
  return (
    <SelectPrimitive.Trigger
      data-slot="select-trigger"
      className={cn(
        "inline-flex min-h-44 w-full cursor-pointer items-center justify-between gap-9 rounded-pill border border-charcoal bg-obsidian py-9 pr-16 pl-20 text-left text-body-sm whitespace-nowrap text-snow transition-colors hover:border-steel disabled:cursor-not-allowed disabled:text-steel aria-invalid:border-node-magenta data-[placeholder]:text-steel [&>span]:flex [&>span]:items-center [&>span]:gap-9 [&>span]:truncate",
        className,
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon asChild>
        <ChevronDownIcon
          aria-hidden="true"
          className="size-16 shrink-0 text-cloud"
        />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  );
}

function SelectContent({
  className,
  children,
  position = "popper",
  ...props
}: ComponentProps<typeof SelectPrimitive.Content>) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        data-slot="select-content"
        position={position}
        sideOffset={position === "popper" ? 6 : undefined}
        className={cn(
          popoverClass,
          "max-h-(--radix-select-content-available-height) min-w-(--radix-select-trigger-width)",
          className,
        )}
        {...props}
      >
        <SelectPrimitive.Viewport className="p-4">
          {children}
        </SelectPrimitive.Viewport>
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  );
}

function SelectLabel({
  className,
  ...props
}: ComponentProps<typeof SelectPrimitive.Label>) {
  return (
    <SelectPrimitive.Label
      data-slot="select-label"
      className={cn(
        "px-12 py-7 font-mono text-caption text-cloud uppercase",
        className,
      )}
      {...props}
    />
  );
}

function SelectItem({
  className,
  children,
  ...props
}: ComponentProps<typeof SelectPrimitive.Item>) {
  return (
    <SelectPrimitive.Item
      data-slot="select-item"
      className={cn(itemClass, className)}
      {...props}
    >
      <span className="pointer-events-none absolute right-12 flex size-16 items-center justify-center">
        <SelectPrimitive.ItemIndicator>
          <CheckIcon aria-hidden="true" className="size-16 text-white" />
        </SelectPrimitive.ItemIndicator>
      </span>
      <SelectPrimitive.ItemText asChild>
        <span className="flex items-center gap-9">{children}</span>
      </SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
  );
}

function SelectSeparator({
  className,
  ...props
}: ComponentProps<typeof SelectPrimitive.Separator>) {
  return (
    <SelectPrimitive.Separator
      data-slot="select-separator"
      className={cn("-mx-4 my-4 h-px bg-charcoal", className)}
      {...props}
    />
  );
}

export {
  itemClass,
  popoverClass,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
};
