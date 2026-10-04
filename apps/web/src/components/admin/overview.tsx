"use client";

import Link from "next/link";
import { AddressChip } from "@/components/item/address-chip";
import { NodeDot } from "@/components/item/node-dot";
import { EthAmount } from "@/components/item/reward-amount";
import {
  ConfigPanel,
  ContractPanel,
  Panel,
  Row,
  RowsSkeleton,
  TotalsPanel,
  Unavailable,
} from "@/components/transparency/transparency-view";
import { Button } from "@/components/ui/button";
import { useAdminDisputes, useAdminOverview } from "@/hooks/useAdmin";
import { VERIFIER_LOW_BALANCE } from "@/lib/admin";
import { formatEthValue } from "@/lib/format";
import { Note } from "./parts";
import { STUDENT_STATUS_META } from "./students";

/** Overview tab (admins): contract, pause state, config, totals, verifier wallet, queues. */
export function Overview() {
  return (
    <div className="flex flex-col gap-24">
      <h2 className="text-heading-sm">Overview</h2>
      <div className="grid gap-24 lg:grid-cols-2">
        <VerifierPanel />
        <QueuesPanel />
        <ContractPanel />
        <ConfigPanel />
        <TotalsPanel />
      </div>
    </div>
  );
}

function VerifierPanel() {
  const overview = useAdminOverview();
  return (
    <Panel title="Verifier wallet" id="verifier-title">
      {overview.isPending ? (
        <RowsSkeleton rows={2} />
      ) : overview.isError ? (
        <Unavailable onRetry={() => overview.refetch()}>
          {overview.error.message}
        </Unavailable>
      ) : (
        <>
          <dl className="flex flex-col gap-12">
            <Row label="Address">
              <AddressChip
                address={overview.data.verifier.address}
                className="sm:justify-end"
              />
            </Row>
            <Row label="Balance">
              <EthAmount wei={overview.data.verifier.balance} />
            </Row>
          </dl>
          {overview.data.verifier.balance < VERIFIER_LOW_BALANCE ? (
            <Note>
              <p>
                Below {formatEthValue(VERIFIER_LOW_BALANCE)} ETH. This wallet
                pays gas for every activation and removal; top it up with
                Sepolia ETH before it runs out.
              </p>
            </Note>
          ) : (
            <Note tone="green">
              <p>Enough test ETH for activations.</p>
            </Note>
          )}
        </>
      )}
    </Panel>
  );
}

function QueuesPanel() {
  const overview = useAdminOverview();
  const disputes = useAdminDisputes();
  return (
    <Panel title="Needs attention" id="queues-title">
      <dl className="flex flex-col gap-12">
        <Row label="Open disputes">
          {disputes.isPending ? (
            "…"
          ) : disputes.isError ? (
            "Unavailable"
          ) : (
            <Link
              href="/admin/disputes"
              className="font-mono tabular underline underline-offset-4 hover:text-white"
            >
              {disputes.data.length}
            </Link>
          )}
        </Row>
        {(["failed", "pending", "verified", "revoked"] as const).map(
          (status) => (
            <Row
              key={status}
              label={`${STUDENT_STATUS_META[status].label} students`}
            >
              <span className="inline-flex items-center gap-7 font-mono tabular">
                <NodeDot tone={STUDENT_STATUS_META[status].tone} />
                {overview.data ? overview.data.students[status] : "…"}
              </span>
            </Row>
          ),
        )}
      </dl>
      <Button asChild variant="quiet" size="sm" className="w-fit">
        <Link href="/admin/students">Manage students</Link>
      </Button>
    </Panel>
  );
}
