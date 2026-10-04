"use client";

import { CheckIcon } from "lucide-react";
import Link from "next/link";
import { AddressChip } from "@/components/item/address-chip";
import { Button } from "@/components/ui/button";
import { addressUrl, isLocalChain, sourceCodeUrl } from "@/lib/chain";
import { lostAndFound } from "@/lib/contract";

/** "Every payment is public": the contract address, verified source and a link to audit it. */
export function ContractCard() {
  const explorer = addressUrl(lostAndFound.address);
  const source = sourceCodeUrl(lostAndFound.address);
  return (
    <section aria-labelledby="public-title" className="page-x">
      <div className="flex flex-col gap-24 rounded-card border border-charcoal bg-carbon p-24 md:flex-row md:items-center md:justify-between md:p-32">
        <div className="flex flex-col gap-12">
          <h2 id="public-title" className="text-heading-sm md:text-heading">
            Every payment is public.
          </h2>
          <p className="max-w-560 text-body text-cloud">
            Rewards sit in a smart contract, not with us. Anyone can check who
            posted, who claimed and who was paid.
          </p>
          <div className="flex flex-col gap-4">
            <span className="font-mono text-caption text-cloud uppercase">
              Contract address
            </span>
            <AddressChip address={lostAndFound.address} />
          </div>
          {source && !isLocalChain && (
            <a
              href={source}
              target="_blank"
              rel="noreferrer"
              className="inline-flex w-fit items-center gap-7 text-body-sm text-snow underline underline-offset-4 hover:text-white"
            >
              <CheckIcon
                aria-hidden="true"
                className="size-16 text-node-green"
              />
              Source code verified on Etherscan
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          )}
        </div>
        <div className="flex flex-wrap gap-12">
          {explorer ? (
            <Button asChild variant="ghost">
              <a href={explorer} target="_blank" rel="noreferrer">
                View the contract
                <span className="sr-only">
                  {" "}
                  on Etherscan (opens in a new tab)
                </span>
              </a>
            </Button>
          ) : null}
          <Button asChild variant="quiet">
            <Link href="/transparency">See the totals</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
