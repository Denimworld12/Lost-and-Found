"use client";

import { CheckIcon, CopyIcon, ExternalLinkIcon } from "lucide-react";
import { useEffect, useState } from "react";
import type { Address } from "viem";
import { addressUrl } from "@/lib/chain";
import { shortAddress } from "@/lib/format";
import { cn } from "@/lib/utils";

const iconButton =
  "inline-flex size-32 pointer-coarse:size-44 shrink-0 cursor-pointer items-center justify-center rounded-chip text-cloud transition-colors hover:bg-obsidian hover:text-white [&_svg]:size-14";

/** `0x4b…91af` in DM Mono with a copy button and an Etherscan link. Shows a "You" pill for the viewer. */
export function AddressChip({
  address,
  isYou = false,
  full = false,
  className,
}: {
  address: Address;
  isYou?: boolean;
  /** Show the whole address (wraps on small screens). */
  full?: boolean;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const explorer = addressUrl(address);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
    } catch {
      // Clipboard blocked (insecure context or permissions); the full address is in the link title.
    }
  }

  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-4 font-mono text-body-sm text-snow",
        className,
      )}
    >
      <span
        className={cn("tabular", full ? "break-all" : "whitespace-nowrap")}
        title={address}
      >
        {full ? address : shortAddress(address)}
      </span>
      {isYou && (
        <span className="rounded-badge border border-steel px-7 py-px text-caption text-white uppercase">
          You
        </span>
      )}
      <button
        type="button"
        onClick={copy}
        className={iconButton}
        aria-label={copied ? "Address copied" : `Copy address ${address}`}
      >
        {copied ? (
          <CheckIcon aria-hidden="true" />
        ) : (
          <CopyIcon aria-hidden="true" />
        )}
      </button>
      {explorer && (
        <a
          href={explorer}
          target="_blank"
          rel="noreferrer"
          className={iconButton}
          aria-label={`View ${shortAddress(address)} on Etherscan (opens in a new tab)`}
        >
          <ExternalLinkIcon aria-hidden="true" />
        </a>
      )}
      <span role="status" className="sr-only">
        {copied ? "Address copied" : ""}
      </span>
    </span>
  );
}
