"use client";

import { XIcon } from "lucide-react";
import { useState, useSyncExternalStore } from "react";

export const ANNOUNCEMENT_STORAGE_KEY = "clf:announcement-dismissed";

/**
 * Runs before paint (inline in <head>) so a dismissed bar never flashes. The bar hides via
 * `html[data-announcement-dismissed]` in CSS.
 */
export const announcementScript = `try{if(localStorage.getItem("${ANNOUNCEMENT_STORAGE_KEY}"))document.documentElement.setAttribute("data-announcement-dismissed","")}catch(e){}`;

/** Whether the bar was dismissed earlier. False when storage is unavailable. */
export function isAnnouncementDismissed(): boolean {
  try {
    return localStorage.getItem(ANNOUNCEMENT_STORAGE_KEY) !== null;
  } catch {
    return false;
  }
}

function subscribeToStorage(onChange: () => void) {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}

/** Node Green bar: testnet notice, dismissal remembered in localStorage. */
export function AnnouncementBar() {
  const [dismissed, setDismissed] = useState(false);
  // Also read storage after hydration: the head script is missing from some responses
  // (Next's not-found HTML), and the bar must still stay hidden there.
  const stored = useSyncExternalStore(
    subscribeToStorage,
    isAnnouncementDismissed,
    () => false,
  );
  if (dismissed || stored) return null;

  function dismiss() {
    try {
      localStorage.setItem(ANNOUNCEMENT_STORAGE_KEY, "1");
    } catch {
      // Storage blocked; the bar still closes for this page view.
    }
    document.documentElement.setAttribute("data-announcement-dismissed", "");
    setDismissed(true);
  }

  return (
    <div className="announcement-bar bg-node-green text-abyss">
      <div className="page-x flex min-h-40 items-center gap-12 py-4">
        <p className="flex-1 font-clash text-caption font-medium tracking-clash uppercase sm:text-body-sm">
          Runs on the Sepolia test network. Rewards use test ETH with no real
          value.
        </p>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss notice"
          className="relative -mr-12 inline-flex size-40 shrink-0 cursor-pointer items-center justify-center rounded-pill after:absolute after:-inset-2 after:content-[''] hover:bg-abyss/10 focus-visible:outline-abyss [&_svg]:size-16"
        >
          <XIcon aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
