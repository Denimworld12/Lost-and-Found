"use client";

import { XIcon } from "lucide-react";
import { Dialog as SheetPrimitive } from "radix-ui";
import type { ComponentProps } from "react";
import { closeButtonClass, overlayClass } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

function Sheet(props: ComponentProps<typeof SheetPrimitive.Root>) {
  return <SheetPrimitive.Root data-slot="sheet" {...props} />;
}

function SheetTrigger(props: ComponentProps<typeof SheetPrimitive.Trigger>) {
  return <SheetPrimitive.Trigger data-slot="sheet-trigger" {...props} />;
}

function SheetClose(props: ComponentProps<typeof SheetPrimitive.Close>) {
  return <SheetPrimitive.Close data-slot="sheet-close" {...props} />;
}

const sideClass = {
  right:
    "inset-y-0 right-0 h-full w-[min(320px,85vw)] border-l motion-safe:data-[state=open]:slide-in-from-right motion-safe:data-[state=closed]:slide-out-to-right",
  left: "inset-y-0 left-0 h-full w-[min(320px,85vw)] border-r motion-safe:data-[state=open]:slide-in-from-left motion-safe:data-[state=closed]:slide-out-to-left",
  bottom:
    "inset-x-0 bottom-0 max-h-[85vh] border-t motion-safe:data-[state=open]:slide-in-from-bottom motion-safe:data-[state=closed]:slide-out-to-bottom",
  top: "inset-x-0 top-0 max-h-[85vh] border-b motion-safe:data-[state=open]:slide-in-from-top motion-safe:data-[state=closed]:slide-out-to-top",
} as const;

/** Carbon panel sliding in from a side (mobile menu). */
function SheetContent({
  className,
  children,
  side = "right",
  showCloseButton = true,
  ...props
}: ComponentProps<typeof SheetPrimitive.Content> & {
  side?: keyof typeof sideClass;
  showCloseButton?: boolean;
}) {
  return (
    <SheetPrimitive.Portal>
      <SheetPrimitive.Overlay className={overlayClass} />
      <SheetPrimitive.Content
        data-slot="sheet-content"
        className={cn(
          "fixed z-50 flex flex-col gap-24 overflow-y-auto border-charcoal bg-carbon p-24 text-snow motion-safe:duration-200 motion-safe:data-[state=closed]:animate-out motion-safe:data-[state=open]:animate-in",
          sideClass[side],
          className,
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          <SheetPrimitive.Close
            data-slot="sheet-close"
            className={closeButtonClass}
            aria-label="Close menu"
          >
            <XIcon aria-hidden="true" />
          </SheetPrimitive.Close>
        )}
      </SheetPrimitive.Content>
    </SheetPrimitive.Portal>
  );
}

function SheetHeader({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-header"
      className={cn("flex flex-col gap-4 pr-48", className)}
      {...props}
    />
  );
}

function SheetFooter({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-footer"
      className={cn("mt-auto flex flex-col gap-12", className)}
      {...props}
    />
  );
}

function SheetTitle({
  className,
  ...props
}: ComponentProps<typeof SheetPrimitive.Title>) {
  return (
    <SheetPrimitive.Title
      data-slot="sheet-title"
      className={cn(
        "font-clash text-subheading font-medium tracking-clash text-white",
        className,
      )}
      {...props}
    />
  );
}

function SheetDescription({
  className,
  ...props
}: ComponentProps<typeof SheetPrimitive.Description>) {
  return (
    <SheetPrimitive.Description
      data-slot="sheet-description"
      className={cn("text-body-sm text-cloud", className)}
      {...props}
    />
  );
}

export {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
};
