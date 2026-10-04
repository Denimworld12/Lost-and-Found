"use client";

import { Toaster as Sonner, type ToasterProps } from "sonner";

/**
 * Toasts: Carbon card, Charcoal border, past-tense message. Callers pass a node dot as the
 * toast icon (Green success, Magenta error, Steel cancelled).
 */
function Toaster(props: ToasterProps) {
  return (
    <Sonner
      theme="dark"
      position="bottom-right"
      offset={24}
      mobileOffset={{ bottom: 72, left: 16, right: 16 }}
      toastOptions={{
        unstyled: true,
        classNames: {
          toast:
            "flex w-full items-center gap-12 rounded-card border border-charcoal bg-carbon px-16 py-14 text-body-sm text-snow",
          title: "font-sans text-body-sm text-white",
          description: "text-caption text-cloud",
          actionButton:
            "rounded-pill bg-signal-orange px-12 py-4 font-clash text-caption tracking-clash text-abyss uppercase",
          cancelButton:
            "rounded-pill px-12 py-4 font-clash text-caption tracking-clash text-snow uppercase",
        },
      }}
      {...props}
    />
  );
}

export { Toaster };
