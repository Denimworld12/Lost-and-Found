import { CATEGORIES, type Category } from "@milgaya/shared";
import { parseEther } from "viem";
import { itemDetailsSchema, type ItemDetails } from "./ipfs";
import { formatEthValue } from "./format";

/** What the student types across the four steps. Kept in memory until the post is on-chain. */
export interface PostForm {
  title: string;
  category: Category | "";
  location: string;
  /** `YYYY-MM-DD`. */
  lostOn: string;
  description: string;
  /** Reward in ETH as typed, e.g. "0.005". */
  reward: string;
}

export const EMPTY_POST_FORM: PostForm = {
  title: "",
  category: "",
  location: "",
  lostOn: "",
  description: "",
  reward: "",
};

export const REWARD_PICKS = ["0.001", "0.005", "0.01"] as const;

export type DetailField =
  "title" | "category" | "location" | "lostOn" | "description";

/** The step 1 fields as the upload API expects them (empty description left out). */
export function toItemDetails(
  form: PostForm,
): Record<string, string | undefined> {
  return {
    title: form.title,
    category: form.category || undefined,
    location: form.location,
    lostOn: form.lostOn || undefined,
    description: form.description.trim() ? form.description : undefined,
  };
}

const FIELD_COPY: Record<DetailField, string> = {
  title: "Add a short title, up to 60 characters.",
  category: "Pick a category.",
  location: "Say where you lost it, up to 80 characters.",
  lostOn: "Pick the day you lost it.",
  description: "Keep the description under 280 characters.",
};

/**
 * Step 1 errors by field, from the same zod schema the upload API uses. Copy is ours, except
 * the schema's own "can't be in the future" message for the date.
 */
export function detailErrors(
  form: PostForm,
): Partial<Record<DetailField, string>> {
  const result = itemDetailsSchema.safeParse(toItemDetails(form));
  if (result.success) return {};
  const errors: Partial<Record<DetailField, string>> = {};
  for (const issue of result.error.issues) {
    const field = issue.path[0] as DetailField;
    if (errors[field]) continue;
    errors[field] =
      issue.code === "custom" && field === "lostOn"
        ? issue.message
        : FIELD_COPY[field];
  }
  return errors;
}

export function parsedDetails(form: PostForm): ItemDetails | null {
  const result = itemDetailsSchema.safeParse(toItemDetails(form));
  return result.success ? result.data : null;
}

/**
 * The reward in wei, or an error to show. A plain decimal with up to 18 places; at least the
 * contract's current minimum.
 */
export function parseReward(
  value: string,
  minReward: bigint | undefined,
): { wei: bigint } | { error: string } {
  const trimmed = value.trim();
  if (!trimmed) return { error: "Enter a reward." };
  if (!/^(\d+\.?\d*|\.\d+)$/.test(trimmed) || /\.\d{19,}$/.test(trimmed))
    return { error: "Enter the reward as a number, like 0.005." };
  const wei = parseEther(trimmed);
  if (minReward !== undefined && wei < minReward)
    return {
      error: `The reward must be at least ${formatEthValue(minReward)} ETH.`,
    };
  return { wei };
}

/** Latest day the date picker allows: today in the visitor's time zone. */
export function todayLocal(now = new Date()): string {
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function isCategory(value: string): value is Category {
  return (CATEGORIES as readonly string[]).includes(value);
}

/** True once the student has typed or picked anything (for the leave-page warning). */
export function isDirty(form: PostForm, hasPhoto: boolean): boolean {
  return (
    hasPhoto ||
    (Object.keys(form) as (keyof PostForm)[]).some((key) => form[key] !== "")
  );
}
