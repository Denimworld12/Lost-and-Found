"use client";

import Link from "next/link";
import { AddressChip } from "@/components/item/address-chip";
import { NodeDot } from "@/components/item/node-dot";
import { isLocalChain, sourceCodeUrl } from "@/lib/chain";
import { lostAndFound } from "@/lib/contract";
import { LogoMark } from "./logo";
import { NAV_LINKS } from "./nav";

const TRUST = [
  "Rewards held in escrow",
  "Source verified",
  "No personal data on-chain",
] as const;

/** Abyss footer with a Charcoal top border: contract chip, verified source link and the trust strip. */
export function SiteFooter() {
  const source = sourceCodeUrl(lostAndFound.address);
  return (
    <footer className="border-t border-charcoal bg-abyss">
      <div className="page-x flex flex-col gap-32 py-48">
        <div className="flex flex-col gap-24 md:flex-row md:items-start md:justify-between">
          <div className="flex flex-col gap-12">
            <div className="flex items-center gap-9">
              <LogoMark className="size-24" />
              <span className="font-clash text-body-sm font-semibold tracking-clash text-white uppercase">
                MilGaya
              </span>
            </div>
            <div className="flex flex-col gap-4">
              <span className="font-mono text-caption text-cloud uppercase">
                Contract{isLocalChain ? " (local)" : " on Sepolia"}
              </span>
              <AddressChip address={lostAndFound.address} />
            </div>
            {source && (
              <a
                href={source}
                target="_blank"
                rel="noreferrer"
                className="w-fit text-body-sm text-snow underline underline-offset-4 hover:text-white"
              >
                Read the verified source code
                <span className="sr-only"> (opens Etherscan in a new tab)</span>
              </a>
            )}
          </div>
          <nav aria-label="Footer">
            <ul className="flex flex-wrap gap-x-24 gap-y-4">
              {NAV_LINKS.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="inline-flex min-h-44 items-center font-clash text-body-sm font-medium tracking-clash text-snow uppercase hover:text-white"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
        <ul className="flex flex-col gap-9 border-t border-charcoal pt-24 sm:flex-row sm:flex-wrap sm:gap-24">
          {TRUST.map((label) => (
            <li
              key={label}
              className="inline-flex items-center gap-7 font-mono text-caption text-cloud uppercase"
            >
              <NodeDot tone="green" />
              {label}
            </li>
          ))}
        </ul>
      </div>
    </footer>
  );
}
