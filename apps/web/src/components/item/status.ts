import type { Category, ItemStatus } from "@milgaya/shared";
import type { ItemEvent } from "@/lib/graph";

export type NodeTone =
  "cyan" | "violet" | "magenta" | "green" | "orange" | "steel";

/** Status → node dot, DM Mono label and the StatusPanel's one-line explanation (docs/UI_SPEC.md). */
export const STATUS_META: Record<
  ItemStatus,
  { tone: NodeTone; label: string; explanation: string }
> = {
  Open: {
    tone: "cyan",
    label: "Open",
    explanation: "Still lost. The reward is locked until someone returns it.",
  },
  Claimed: {
    tone: "violet",
    label: "Claimed",
    explanation:
      "Someone found it. Waiting for the owner to confirm the return.",
  },
  Disputed: {
    tone: "magenta",
    label: "Disputed",
    explanation:
      "Waiting for the security office to decide who gets the reward.",
  },
  Completed: {
    tone: "green",
    label: "Returned",
    explanation: "The finder was paid the reward.",
  },
  Cancelled: {
    tone: "steel",
    label: "Cancelled",
    explanation: "The owner cancelled this listing and got the reward back.",
  },
};

/**
 * The StatusPanel line. A completed item says how it completed, read from its newest event
 * (newest first); without that event it falls back to the neutral line.
 */
export function statusExplanation(
  status: ItemStatus,
  events: readonly ItemEvent[] | undefined,
): string {
  if (status === "Completed") {
    const last = events?.[0];
    if (last?.kind === "Confirmed")
      return "The owner confirmed the item was returned.";
    if (last?.kind === "TimeoutClaimed")
      return "The confirm window passed without a response, so the finder was paid automatically.";
    if (last?.kind === "Resolved" && last.finderWins === true)
      return "A dispute was raised and the arbiter ruled in the finder's favor.";
  }
  return STATUS_META[status].explanation;
}

/** Category → node dot colour (docs/UI_SPEC.md → Category mapping). */
export const CATEGORY_TONE: Record<Category, NodeTone> = {
  Electronics: "cyan",
  "ID & cards": "violet",
  Keys: "orange",
  Bags: "magenta",
  "Books & notes": "green",
  Clothing: "steel",
  Bottles: "steel",
  Other: "steel",
};

/** URL values for the status filter. `Completed` reads as "Returned" everywhere in the UI. */
export const STATUS_FILTERS = [
  "Open",
  "Claimed",
  "Disputed",
  "Completed",
  "Cancelled",
] as const satisfies readonly ItemStatus[];
