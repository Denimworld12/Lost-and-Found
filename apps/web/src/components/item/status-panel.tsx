"use client";

import type { ItemStatus } from "@milgaya/shared";
import { useItemHistory } from "@/hooks/useItem";
import { cn } from "@/lib/utils";
import { NodeDot } from "./node-dot";
import { STATUS_META, statusExplanation } from "./status";

/** Carbon card with the status as a large label (10px dot) and a one-line explanation. */
export function StatusPanel({
  id,
  status,
  className,
}: {
  id: bigint;
  status: ItemStatus;
  className?: string;
}) {
  const meta = STATUS_META[status];
  const { data: history } = useItemHistory(id, status);
  return (
    <div
      className={cn(
        "flex flex-col gap-9 rounded-card border border-charcoal bg-carbon p-24",
        className,
      )}
    >
      <p className="inline-flex items-center gap-12 font-clash text-heading-sm font-medium tracking-clash text-white uppercase">
        <NodeDot tone={meta.tone} size={10} />
        <span>
          <span className="sr-only">Status: </span>
          {meta.label}
        </span>
      </p>
      <p className="text-body text-cloud">
        {statusExplanation(status, history?.events)}
      </p>
    </div>
  );
}
