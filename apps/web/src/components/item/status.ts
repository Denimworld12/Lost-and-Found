import type { Category, ItemStatus } from "@clf/shared";

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
    explanation: "Back with its owner. The finder was paid the reward.",
  },
  Cancelled: {
    tone: "steel",
    label: "Cancelled",
    explanation: "The owner cancelled this listing and got the reward back.",
  },
};

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
