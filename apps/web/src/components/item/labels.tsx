import type { Category, ItemStatus } from "@milgaya/shared";
import { cn } from "@/lib/utils";
import { NodeDot } from "./node-dot";
import { CATEGORY_TONE, STATUS_META } from "./status";

/** Dot + DM Mono 12px uppercase label, e.g. `● OPEN`. */
export function StatusLabel({
  status,
  className,
}: {
  status: ItemStatus;
  className?: string;
}) {
  const meta = STATUS_META[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-7 font-mono text-caption text-snow uppercase",
        className,
      )}
    >
      <NodeDot tone={meta.tone} />
      {meta.label}
    </span>
  );
}

/** StatusBadge: the status label inside an Obsidian pill with a Steel border. */
export function StatusBadge({
  status,
  className,
}: {
  status: ItemStatus;
  className?: string;
}) {
  const meta = STATUS_META[status];
  return (
    <span
      className={cn(
        "inline-flex w-fit items-center gap-7 rounded-badge border border-steel bg-obsidian px-12 py-4 font-mono text-caption whitespace-nowrap text-snow uppercase",
        className,
      )}
    >
      <NodeDot tone={meta.tone} />
      {meta.label}
    </span>
  );
}

/** Category dot + DM Mono label. Unknown category (metadata not loaded) shows a Steel dot and "Item". */
export function CategoryLabel({
  category,
  className,
}: {
  category?: Category;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-7 font-mono text-caption text-cloud uppercase",
        className,
      )}
    >
      <NodeDot tone={category ? CATEGORY_TONE[category] : "steel"} />
      {category ?? "Item"}
    </span>
  );
}
