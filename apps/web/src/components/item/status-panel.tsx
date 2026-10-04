import type { ItemStatus } from "@clf/shared";
import { cn } from "@/lib/utils";
import { NodeDot } from "./node-dot";
import { STATUS_META } from "./status";

/** Carbon card with the status as a large label (10px dot) and a one-line explanation. */
export function StatusPanel({
  status,
  className,
}: {
  status: ItemStatus;
  className?: string;
}) {
  const meta = STATUS_META[status];
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
      <p className="text-body text-cloud">{meta.explanation}</p>
    </div>
  );
}
