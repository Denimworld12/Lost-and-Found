"use client";

import { CheckIcon, ExternalLinkIcon } from "lucide-react";
import type { ReactNode } from "react";
import type { Address } from "viem";
import { AddressChip } from "@/components/item/address-chip";
import { LocalTime } from "@/components/item/local-time";
import { NodeDot } from "@/components/item/node-dot";
import { EthAmount } from "@/components/item/reward-amount";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useContractConfig,
  useContractTotals,
  useRecentEvents,
  useRoleHolders,
  useStats,
} from "@/hooks/useChainData";
import { eventsUrl, isLocalChain, sourceCodeUrl, txUrl } from "@/lib/chain";
import { lostAndFound, type ContractEvent } from "@/lib/contract";
import { formatDuration, formatEthValue, shortAddress } from "@/lib/format";
import { CHAIN_FALLBACK_LIMIT } from "@/lib/graph";

export function Panel({
  title,
  id,
  children,
}: {
  title: string;
  id: string;
  children: ReactNode;
}) {
  return (
    <section
      aria-labelledby={id}
      className="flex flex-col gap-16 rounded-card border border-charcoal bg-carbon p-24"
    >
      <h2 id={id} className="text-subheading">
        {title}
      </h2>
      {children}
    </section>
  );
}

export function Row({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 border-t border-charcoal pt-12 first:border-t-0 first:pt-0 sm:flex-row sm:items-baseline sm:justify-between sm:gap-16">
      <dt className="text-body-sm text-cloud">{label}</dt>
      <dd className="text-body text-snow sm:text-right">{children}</dd>
    </div>
  );
}

export function Unavailable({
  onRetry,
  children,
}: {
  onRetry: () => void;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col items-start gap-12">
      <p className="text-body-sm text-cloud">{children}</p>
      <Button variant="ghost" size="sm" onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}

export function RowsSkeleton({ rows }: { rows: number }) {
  return (
    <div aria-hidden="true" className="flex flex-col gap-16">
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="flex justify-between gap-16">
          <Skeleton className="h-16 w-120" />
          <Skeleton className="h-16 w-96" />
        </div>
      ))}
    </div>
  );
}

export function ContractPanel() {
  const source = sourceCodeUrl(lostAndFound.address);
  return (
    <Panel title="Contract" id="contract-title">
      <dl className="flex flex-col gap-12">
        <Row label="Address">
          <AddressChip
            address={lostAndFound.address}
            full
            className="sm:justify-end"
          />
        </Row>
        <Row label="Network">
          {isLocalChain
            ? "Local Hardhat node"
            : "Ethereum Sepolia (test network)"}
        </Row>
        <Row label="Source code">
          {source ? (
            <a
              href={source}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-7 underline underline-offset-4 hover:text-white"
            >
              <CheckIcon
                aria-hidden="true"
                className="size-16 text-node-green"
              />
              Verified on Etherscan
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          ) : (
            "Not published on a local chain"
          )}
        </Row>
      </dl>
    </Panel>
  );
}

export function ConfigPanel() {
  const { data, isPending, isError, refetch } = useContractConfig();
  return (
    <Panel title="Current rules" id="config-title">
      {isPending ? (
        <RowsSkeleton rows={4} />
      ) : isError ? (
        <Unavailable onRetry={() => refetch()}>
          We couldn&apos;t read the contract settings.
        </Unavailable>
      ) : (
        <dl className="flex flex-col gap-12">
          <Row label="Minimum reward">
            <EthAmount wei={data.minReward} />
          </Row>
          <Row label="Finder's deposit">
            <EthAmount wei={data.claimStake} />
          </Row>
          <Row label="Owner's response window">
            {formatDuration(data.confirmWindow)}
          </Row>
          <Row label="Posting and claiming">
            <span className="inline-flex items-center gap-7 font-mono text-caption uppercase">
              <NodeDot tone={data.paused ? "magenta" : "green"} />
              {data.paused ? "Paused" : "Open"}
            </span>
          </Row>
        </dl>
      )}
    </Panel>
  );
}

export function TotalsPanel() {
  const stats = useStats();
  const totals = useContractTotals();
  const pending = stats.isPending || totals.isPending;
  const failed = stats.isError || totals.isError;
  return (
    <Panel title="Totals" id="totals-title">
      {pending ? (
        <RowsSkeleton rows={5} />
      ) : failed || !stats.data || !totals.data ? (
        <Unavailable
          onRetry={() => {
            stats.refetch();
            totals.refetch();
          }}
        >
          We couldn&apos;t read the totals.
        </Unavailable>
      ) : (
        <>
          <dl className="flex flex-col gap-12">
            <Row label="Held in escrow now">
              <span className="font-mono tabular">
                <span className="text-signal-orange">
                  {formatEthValue(totals.data.totalEscrowed)}
                </span>{" "}
                <span className="text-cloud">ETH</span>
              </span>
            </Row>
            <Row label="Waiting to be withdrawn">
              <EthAmount wei={totals.data.totalCredited} />
            </Row>
            <Row label="Items posted">
              <span className="font-mono tabular">
                {stats.data.itemsPosted.toString()}
              </span>
            </Row>
            <Row label="Items returned">
              <span className="font-mono tabular">
                {stats.data.itemsReturned.toString()}
              </span>
            </Row>
            <Row label="Rewards paid to finders">
              <EthAmount wei={stats.data.totalRewardsPaid} />
            </Row>
            <Row label="Open right now">
              <span className="font-mono tabular">
                {stats.data.openItems.toString()}
              </span>
            </Row>
          </dl>
          {stats.data.partial && (
            <p className="text-caption text-cloud">
              Returned, paid and open counts cover the latest{" "}
              {CHAIN_FALLBACK_LIMIT} items.
            </p>
          )}
        </>
      )}
    </Panel>
  );
}

const ROLE_LABELS = {
  admin: {
    title: "Admin",
    detail: "Changes settings and pauses posting. Can't move escrowed funds.",
  },
  arbiter: { title: "Arbiter (security office)", detail: "Decides disputes." },
  verifier: {
    title: "Verifier",
    detail: "Adds verified students to the list.",
  },
} as const;

function RolesPanel() {
  const { data, isPending, isError, refetch } = useRoleHolders();
  return (
    <Panel title="Who holds each role" id="roles-title">
      {isPending ? (
        <RowsSkeleton rows={3} />
      ) : isError ? (
        <Unavailable onRetry={() => refetch()}>
          We couldn&apos;t read the role history from this network connection.
        </Unavailable>
      ) : (
        <dl className="flex flex-col gap-16">
          {(Object.keys(ROLE_LABELS) as (keyof typeof ROLE_LABELS)[]).map(
            (role) => (
              <div
                key={role}
                className="flex flex-col gap-4 border-t border-charcoal pt-12 first:border-t-0 first:pt-0"
              >
                <dt className="flex flex-col">
                  <span className="text-body text-white">
                    {ROLE_LABELS[role].title}
                  </span>
                  <span className="text-body-sm text-cloud">
                    {ROLE_LABELS[role].detail}
                  </span>
                </dt>
                <dd className="flex flex-col gap-4">
                  {data[role].length === 0 ? (
                    <span className="text-body-sm text-cloud">Nobody</span>
                  ) : (
                    data[role].map((address: Address) => (
                      <AddressChip key={address} address={address} />
                    ))
                  )}
                </dd>
              </div>
            ),
          )}
        </dl>
      )}
    </Panel>
  );
}

const EVENT_LABELS: Partial<Record<ContractEvent["name"], string>> = {
  ItemPosted: "Item posted",
  ItemClaimed: "Item claimed",
  ReturnConfirmed: "Return confirmed",
  ClaimRejected: "Claim rejected",
  DisputeRaised: "Dispute opened",
  DisputeResolved: "Dispute resolved",
  TimeoutClaimed: "Reward collected after timeout",
  ItemCancelled: "Listing cancelled",
  Withdrawn: "Withdrawn",
  StudentVerified: "Student verified",
  StudentRevoked: "Student removed",
  ConfigUpdated: "Rules changed",
  RoleGranted: "Role granted",
  RoleRevoked: "Role removed",
  Paused: "Posting paused",
  Unpaused: "Posting resumed",
};

function eventDetail(event: ContractEvent): string {
  const args = event.args;
  const parts: string[] = [];
  if (event.itemId !== null) parts.push(`Item #${event.itemId.toString()}`);
  const amount = args.reward ?? args.stake ?? args.amount ?? args.stakeToOwner;
  if (typeof amount === "bigint") parts.push(`${formatEthValue(amount)} ETH`);
  const who =
    args.owner ??
    args.finder ??
    args.by ??
    args.to ??
    args.student ??
    args.account ??
    args.arbiter;
  if (typeof who === "string") parts.push(shortAddress(who));
  if (event.name === "DisputeResolved")
    parts.push(args.finderWins ? "finder paid" : "sided with owner");
  return parts.join(" · ");
}

function EventsPanel() {
  const { data, isPending, isError, refetch } = useRecentEvents(20);
  const allEvents = eventsUrl(lostAndFound.address);
  return (
    <section aria-labelledby="events-title" className="flex flex-col gap-16">
      <div className="flex flex-wrap items-end justify-between gap-12">
        <h2 id="events-title" className="text-heading-sm">
          Latest contract events
        </h2>
        {allEvents && (
          <Button asChild variant="quiet" size="sm">
            <a href={allEvents} target="_blank" rel="noreferrer">
              All events on Etherscan
              <span className="sr-only"> (opens in a new tab)</span>
              <ExternalLinkIcon aria-hidden="true" />
            </a>
          </Button>
        )}
      </div>
      <div className="overflow-hidden rounded-card border border-charcoal bg-carbon">
        {isPending ? (
          <div className="p-24">
            <RowsSkeleton rows={5} />
          </div>
        ) : isError ? (
          <div className="p-24">
            <Unavailable onRetry={() => refetch()}>
              We couldn&apos;t read recent events from this network connection.
              Etherscan has the full record.
            </Unavailable>
          </div>
        ) : data.events.length === 0 ? (
          <p className="p-24 text-body-sm text-cloud">No events yet.</p>
        ) : (
          <table className="w-full text-left">
            <caption className="sr-only">
              The latest {data.events.length} events, newest first
            </caption>
            <thead className="hidden bg-obsidian sm:table-header-group">
              <tr>
                <th
                  scope="col"
                  className="px-24 py-12 font-mono text-caption font-normal text-cloud uppercase"
                >
                  Event
                </th>
                <th
                  scope="col"
                  className="px-24 py-12 font-mono text-caption font-normal text-cloud uppercase"
                >
                  Details
                </th>
                <th
                  scope="col"
                  className="px-24 py-12 font-mono text-caption font-normal text-cloud uppercase"
                >
                  When
                </th>
                <th
                  scope="col"
                  className="px-24 py-12 font-mono text-caption font-normal text-cloud uppercase"
                >
                  <span className="sr-only">Transaction</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-charcoal">
              {data.events.map((event) => {
                const link = txUrl(event.txHash);
                return (
                  <tr
                    key={`${event.txHash}-${event.logIndex}`}
                    className="flex flex-col gap-4 px-24 py-16 sm:table-row sm:p-0"
                  >
                    <td className="text-body-sm text-white sm:px-24 sm:py-12">
                      {EVENT_LABELS[event.name] ?? event.name}
                    </td>
                    <td className="font-mono text-caption text-snow tabular sm:px-24 sm:py-12">
                      {eventDetail(event)}
                    </td>
                    <td className="font-mono text-caption text-cloud uppercase tabular sm:px-24 sm:py-12">
                      {event.timestamp !== null ? (
                        <LocalTime
                          seconds={event.timestamp}
                          format="datetime"
                        />
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="sm:px-24 sm:py-12 sm:text-right">
                      {link && (
                        <a
                          href={link}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex min-h-32 items-center gap-4 font-mono text-caption text-snow uppercase hover:text-white [&_svg]:size-12"
                        >
                          View tx
                          <span className="sr-only">
                            {" "}
                            {event.txHash} on Etherscan (opens in a new tab)
                          </span>
                          <ExternalLinkIcon aria-hidden="true" />
                        </a>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}

export function TransparencyView() {
  return (
    <div className="flex flex-col gap-32">
      <div className="grid gap-24 lg:grid-cols-2">
        <div className="flex flex-col gap-24">
          <ContractPanel />
          <ConfigPanel />
        </div>
        <div className="flex flex-col gap-24">
          <TotalsPanel />
          <RolesPanel />
        </div>
      </div>
      <EventsPanel />
    </div>
  );
}
