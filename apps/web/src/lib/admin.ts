import {
  encodeFunctionData,
  formatEther,
  isHash,
  maxUint128,
  parseEther,
  type Address,
  type Hash,
  type Hex,
} from "viem";
import { z } from "zod";
import { lostAndFound } from "./contract";
import { formatDuration, formatEthValue } from "./format";

/**
 * Admin console rules shared by the API routes and the UI (PLAN.md Phase 9). Pure: no
 * server-only imports.
 */

/** `[id]` in admin student routes: a Clerk user ID. */
export const studentParamsSchema = z.object({
  id: z.string().regex(/^user_[A-Za-z0-9]{1,64}$/, "Not a Clerk user ID."),
});

/** Body of admin student actions. */
export const adminActionSchema = z
  .object({ note: z.string().trim().max(500).optional() })
  .strict();

// ─────────────────────────────────────────────────────────────── Audit log

/** Every `admin_actions.action` the app writes, with its audit log label. */
export const AUDIT_ACTION_LABELS = {
  revoke_student: "Removed a student",
  retry_verification: "Retried a verification",
  resolve_dispute_finder: "Paid the finder",
  resolve_dispute_owner: "Returned to owner",
  set_config: "Changed the settings",
  pause: "Paused posting and claiming",
  unpause: "Resumed posting and claiming",
} as const;

export type AuditAction = keyof typeof AUDIT_ACTION_LABELS;

/** Actor of rows written by the Clerk webhook (account deleted), not by a person. */
export const WEBHOOK_ACTOR = "clerk-webhook";

export const NOTE_MIN = 10;
export const NOTE_MAX = 500;

const txHashSchema = z
  .string()
  .refine((value) => isHash(value), "Not a transaction hash.")
  .transform((value) => value.toLowerCase() as Hash);

const optionalNote = z.string().trim().max(NOTE_MAX).optional();

/** A dispute decision needs a note saying what was checked. */
export const disputeNoteSchema = z
  .string()
  .trim()
  .min(
    NOTE_MIN,
    `Write at least ${NOTE_MIN} characters about what you checked.`,
  )
  .max(NOTE_MAX, `Keep the note under ${NOTE_MAX} characters.`);

/**
 * `POST /api/admin/actions`: records an admin write the browser sent through `useTxFlow`,
 * after its receipt. The server checks the transaction itself before saving anything.
 */
export const logActionSchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("resolve_dispute"),
      txHash: txHashSchema,
      itemId: z
        .string()
        .regex(/^[1-9]\d{0,77}$/, "Item IDs are positive whole numbers.")
        .transform((value) => BigInt(value)),
      finderWins: z.boolean(),
      note: disputeNoteSchema,
    })
    .strict(),
  z
    .object({
      action: z.enum(["set_config", "pause", "unpause"]),
      txHash: txHashSchema,
      note: optionalNote,
    })
    .strict(),
]);

export type LogActionInput = z.input<typeof logActionSchema>;

/** `admin_actions.action` for a dispute decision. */
export function disputeAction(finderWins: boolean): AuditAction {
  return finderWins ? "resolve_dispute_finder" : "resolve_dispute_owner";
}

// ─────────────────────────────────────────────────────────────── Settings

/** The contract's limits (`_setConfig`): amounts above zero that fit in uint128; 5 minutes to 14 days. */
export const CONFIG_BOUNDS = {
  minAmount: 1n,
  maxAmount: maxUint128,
  minWindow: 5n * 60n,
  maxWindow: 14n * 86_400n,
} as const;

export const WINDOW_UNITS = {
  minutes: 60n,
  hours: 3600n,
  days: 86_400n,
} as const;

export type WindowUnit = keyof typeof WINDOW_UNITS;

export interface ConfigValues {
  minReward: bigint;
  claimStake: bigint;
  /** Seconds. */
  confirmWindow: bigint;
}

export interface ConfigForm {
  minReward: string;
  claimStake: string;
  windowValue: string;
  windowUnit: WindowUnit;
}

export type ConfigField = "minReward" | "claimStake" | "confirmWindow";

/** The current settings as form values, using the largest unit that divides the window. */
export function toConfigForm(values: ConfigValues): ConfigForm {
  const unit: WindowUnit =
    values.confirmWindow % WINDOW_UNITS.days === 0n
      ? "days"
      : values.confirmWindow % WINDOW_UNITS.hours === 0n
        ? "hours"
        : "minutes";
  return {
    minReward: formatEther(values.minReward),
    claimStake: formatEther(values.claimStake),
    windowValue: (values.confirmWindow / WINDOW_UNITS[unit]).toString(),
    windowUnit: unit,
  };
}

function parseAmount(value: string, name: string): bigint | string {
  const trimmed = value.trim();
  if (!trimmed) return `Enter the ${name}.`;
  if (!/^(\d+\.?\d*|\.\d+)$/.test(trimmed) || /\.\d{19,}$/.test(trimmed))
    return `Enter the ${name} as a number, like 0.001.`;
  const wei = parseEther(trimmed);
  if (wei < CONFIG_BOUNDS.minAmount) return `The ${name} must be more than 0.`;
  if (wei > CONFIG_BOUNDS.maxAmount) return `That ${name} is too large.`;
  return wei;
}

/** Validates the settings form against the contract's bounds. */
export function parseConfigForm(
  form: ConfigForm,
): { values: ConfigValues } | { errors: Partial<Record<ConfigField, string>> } {
  const errors: Partial<Record<ConfigField, string>> = {};
  const minReward = parseAmount(form.minReward, "minimum reward");
  const claimStake = parseAmount(form.claimStake, "deposit");
  if (typeof minReward === "string") errors.minReward = minReward;
  if (typeof claimStake === "string") errors.claimStake = claimStake;

  let confirmWindow: bigint | null = null;
  const count = form.windowValue.trim();
  if (!/^\d{1,7}$/.test(count)) {
    errors.confirmWindow = "Enter the window as a whole number.";
  } else {
    confirmWindow = BigInt(count) * WINDOW_UNITS[form.windowUnit];
    if (
      confirmWindow < CONFIG_BOUNDS.minWindow ||
      confirmWindow > CONFIG_BOUNDS.maxWindow
    )
      errors.confirmWindow = "The window must be 5 minutes to 14 days.";
  }

  if (
    Object.keys(errors).length > 0 ||
    typeof minReward === "string" ||
    typeof claimStake === "string" ||
    confirmWindow === null
  )
    return { errors };
  return { values: { minReward, claimStake, confirmWindow } };
}

export function sameConfig(a: ConfigValues, b: ConfigValues): boolean {
  return (
    a.minReward === b.minReward &&
    a.claimStake === b.claimStake &&
    a.confirmWindow === b.confirmWindow
  );
}

/** Plain-English preview of new settings (UI_SPEC: "Finders will have to lock 0.0005 ETH"). */
export function describeConfig(values: ConfigValues): string[] {
  return [
    `Owners will have to offer at least ${formatEthValue(values.minReward)} ETH.`,
    `Finders will have to lock ${formatEthValue(values.claimStake)} ETH.`,
    `Owners will have ${formatDuration(values.confirmWindow)} to respond to new claims. Existing claims keep their window.`,
  ];
}

/** `admin_actions.target` for a settings change: the values the contract emitted, in wei and seconds. */
export function configTarget(values: ConfigValues): string {
  return `minReward=${values.minReward} claimStake=${values.claimStake} confirmWindow=${values.confirmWindow}`;
}

export function parseConfigTarget(target: string): ConfigValues | null {
  const match = /^minReward=(\d+) claimStake=(\d+) confirmWindow=(\d+)$/.exec(
    target,
  );
  if (!match) return null;
  return {
    minReward: BigInt(match[1]),
    claimStake: BigInt(match[2]),
    confirmWindow: BigInt(match[3]),
  };
}

// ─────────────────────────────────────────────────────────────── Safe proposals

export type AdminCall =
  | { functionName: "resolveDispute"; args: readonly [bigint, boolean] }
  | { functionName: "setConfig"; args: readonly [bigint, bigint, bigint] }
  | { functionName: "pause"; args: readonly [] }
  | { functionName: "unpause"; args: readonly [] };

/** The transaction a Safe owner proposes: to the contract, no ETH, this calldata. */
export function encodeAdminCall(call: AdminCall): {
  to: `0x${string}`;
  value: "0";
  data: Hex;
} {
  return {
    to: lostAndFound.address,
    value: "0",
    data: encodeFunctionData({
      abi: lostAndFound.abi,
      functionName: call.functionName,
      args: call.args,
    } as Parameters<typeof encodeFunctionData>[0]),
  };
}

/** Safe{Wallet} home for a Safe on Sepolia. */
export function safeAppUrl(safe: `0x${string}`): string {
  return `https://app.safe.global/home?safe=sep:${safe}`;
}

// ─────────────────────────────────────────────────────────────── Overview

/** Below this the verifier can't keep activating students for long (PLAN.md Phase 9). */
export const VERIFIER_LOW_BALANCE = parseEther("0.02");

// ─────────────────────────────────────────────────────────────── Role access

/**
 * How this browser can send a write that needs an on-chain role:
 * - `direct`: the connected wallet holds the role; write through `useTxFlow`.
 * - `safe`: the role is held by a contract (a Safe multi-sig) and not by the connected
 *   wallet; propose the encoded call in Safe instead.
 * - `missing`: the connected wallet doesn't hold the role and no Safe does.
 * - `wallet`: no wallet connected yet (the wallet gate asks for one).
 */
export type RoleAccess =
  | { kind: "loading" }
  | { kind: "wallet"; holders: Address[] }
  | { kind: "direct"; holders: Address[] }
  | { kind: "missing"; account: Address; holders: Address[] }
  | { kind: "safe"; safe: Address; holders: Address[] };

export function decideRoleAccess({
  walletLoading,
  account,
  holders,
  contractHolders,
  holds,
}: {
  walletLoading: boolean;
  /** Wallet connected in MetaMask. */
  account: Address | null;
  /** Current role holders; `null` while loading. */
  holders: Address[] | null;
  /** The holders that are contracts (have bytecode); `null` while loading. */
  contractHolders: Address[] | null;
  /** `hasRole(role, account)`; `null` while loading or with no account. */
  holds: boolean | null;
}): RoleAccess {
  if (walletLoading || holders === null || contractHolders === null)
    return { kind: "loading" };
  const safe = contractHolders[0];
  if (!account)
    return safe ? { kind: "safe", safe, holders } : { kind: "wallet", holders };
  if (holds === null) return { kind: "loading" };
  if (holds) return { kind: "direct", holders };
  if (safe) return { kind: "safe", safe, holders };
  return { kind: "missing", account, holders };
}
