import { cn } from "@/lib/utils";
import type { NodeTone } from "./status";

const TONE_CLASS: Record<NodeTone, string> = {
  cyan: "bg-node-cyan",
  violet: "bg-node-violet",
  magenta: "bg-node-magenta",
  green: "bg-node-green",
  orange: "bg-signal-orange",
  steel: "bg-steel",
};

/** A status light: an 8px (or 10px) dot. Always paired with a text label; never colour alone. */
export function NodeDot({
  tone,
  size = 8,
  className,
}: {
  tone: NodeTone;
  size?: 8 | 10;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-block shrink-0 rounded-badge",
        size === 10 ? "size-10" : "size-8",
        TONE_CLASS[tone],
        className,
      )}
    />
  );
}
