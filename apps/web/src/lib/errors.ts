import { formatDateTime, formatEthValue } from "./format";

/**
 * Plain-English messages for errors the browser sees: the contract's custom errors, wallet
 * and RPC failures, Clerk and our own API routes.
 */

/** MetaMask's "User rejected the request" (EIP-1193 code 4001): a cancelled action, not an error. */
export function isUserRejection(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; current && depth < 6; depth++) {
    const { name, code } = current as { name?: unknown; code?: unknown };
    if (
      name === "UserRejectedRequestError" ||
      code === 4001 ||
      code === "ACTION_REJECTED"
    ) {
      return true;
    }
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

interface ClerkApiErrorLike {
  clerkError?: boolean;
  errors?: { code?: string; message?: string; longMessage?: string }[];
}

/** Clerk error codes that mean "this wallet already belongs to an account". */
const WALLET_TAKEN_CODES = new Set([
  "form_identifier_exists",
  "identifier_already_exists",
]);

export const WALLET_TAKEN_MESSAGE =
  "This wallet is already linked to another account. Use a different MetaMask account.";

/** Message for a failed wallet link (Clerk API error or anything else). */
export function linkWalletErrorMessage(error: unknown): string {
  const clerk = error as ClerkApiErrorLike | null;
  const first = clerk?.errors?.[0];
  if (first?.code && WALLET_TAKEN_CODES.has(first.code))
    return WALLET_TAKEN_MESSAGE;
  if (first?.longMessage || first?.message)
    return (first.longMessage ?? first.message)!;
  return "We couldn't link your wallet. Try again.";
}

/** `{ error: { code, message } }` from our API routes. */
export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
}

/** Fetches one of our JSON API routes; non-2xx replies throw `ApiRequestError` with the server's message. */
export async function apiFetch(
  input: string,
  init?: RequestInit,
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(input, init);
  } catch {
    throw new ApiRequestError(
      0,
      "NETWORK",
      "You seem to be offline. Check your connection and try again.",
    );
  }
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = (
      body as { error?: { code?: string; message?: string } } | null
    )?.error;
    throw new ApiRequestError(
      response.status,
      error?.code ?? "INTERNAL",
      error?.message ??
        "Something went wrong on our side. Try again in a minute.",
    );
  }
  return body;
}

// ─────────────────────────────────────────────────────────────── Contract writes

/** Values some messages need: the current minimum reward and when a claim's window ends. */
export interface TxErrorContext {
  minReward?: bigint;
  /** `claimedAt + claimWindow`, in seconds. */
  windowEndsAt?: bigint;
}

type Message = string | ((context: TxErrorContext) => string);

/** Custom error name → copy (PLAN.md Phase 8 → Error copy). */
export const CONTRACT_ERROR_MESSAGES: Record<string, Message> = {
  NotVerified: "Finish activating your account before posting or claiming.",
  NotOwner: "Only the person who posted this item can do that.",
  NotFinder: "Only the student who claimed this item can do that.",
  NotParty: "Only the owner or finder can raise a dispute.",
  WrongStatus: "This item changed status. Refresh to see the latest.",
  RewardTooLow: ({ minReward }) =>
    minReward !== undefined
      ? `The reward must be at least ${formatEthValue(minReward)} ETH.`
      : "The reward is below the minimum. Refresh and try again.",
  WrongStake: "The claim deposit changed. Refresh and try again.",
  OwnerCannotClaim: "You can't claim your own item.",
  WindowOpen: ({ windowEndsAt }) =>
    windowEndsAt !== undefined
      ? `You can collect after ${formatDateTime(windowEndsAt)} if the owner hasn't responded.`
      : "You can collect once the response window ends if the owner hasn't responded.",
  WindowClosed: "The response window has ended for this claim.",
  NothingToWithdraw: "You have no funds to withdraw.",
  EnforcedPause: "Posting and claiming are paused by the admins right now.",
  // Not in PLAN.md's table; reachable only through stale pages or a broken upload.
  ItemNotFound: "We couldn't find that item. Refresh to see the latest.",
  InvalidCID: "The item details didn't upload correctly. Try again.",
  RewardTooHigh: "That reward is too large.",
  TransferFailed: "The transfer to your wallet failed. Try again.",
  AccessControlUnauthorizedAccount:
    "Your wallet doesn't have permission to do that.",
  // Admin console writes.
  InvalidConfig:
    "Those settings are outside the allowed range. Check the limits under each field.",
  ExpectedPause: "Posting and claiming are already open.",
};

export const INSUFFICIENT_FUNDS_MESSAGE =
  "Not enough Sepolia ETH. Get free test ETH from a faucet.";
export const USER_REJECTED_MESSAGE = "Cancelled in MetaMask.";
const UNKNOWN_REVERT_MESSAGE =
  "This transaction would fail. Refresh the page and try again.";
const UNKNOWN_TX_MESSAGE =
  "Something went wrong talking to the blockchain. Try again in a minute.";

export type TxErrorKind = "rejected" | "contract" | "funds" | "unknown";

export interface TxErrorInfo {
  kind: TxErrorKind;
  message: string;
  /** The contract's custom error name, when the call reverted with one. */
  errorName?: string;
}

/** Each error and its causes, outermost first (viem wraps the revert a few levels deep). */
function* errorChain(error: unknown): Generator<Record<string, unknown>> {
  let current: unknown = error;
  for (let depth = 0; current && depth < 8; depth++) {
    if (typeof current !== "object") return;
    yield current as Record<string, unknown>;
    current = (current as { cause?: unknown }).cause;
  }
}

/** The custom error name from viem's `ContractFunctionRevertedError`, wherever it sits in the chain. */
export function revertErrorName(error: unknown): string | undefined {
  for (const link of errorChain(error)) {
    const data = link.data as { errorName?: unknown } | undefined;
    if (
      link.name === "ContractFunctionRevertedError" &&
      typeof data?.errorName === "string"
    ) {
      return data.errorName;
    }
  }
  return undefined;
}

function isInsufficientFunds(error: unknown): boolean {
  for (const link of errorChain(error)) {
    if (link.name === "InsufficientFundsError") return true;
    for (const key of ["shortMessage", "details", "message"] as const) {
      const text = link[key];
      if (typeof text === "string" && /insufficient funds/i.test(text))
        return true;
    }
  }
  return false;
}

/**
 * Classifies a failed simulation, gas estimate or wallet write and picks the copy to show.
 * A MetaMask rejection is `rejected` (a cancelled action, not an error).
 */
export function describeTxError(
  error: unknown,
  context: TxErrorContext = {},
): TxErrorInfo {
  if (isUserRejection(error))
    return { kind: "rejected", message: USER_REJECTED_MESSAGE };
  const errorName = revertErrorName(error);
  if (errorName) {
    const message = CONTRACT_ERROR_MESSAGES[errorName];
    return {
      kind: "contract",
      errorName,
      message:
        typeof message === "function"
          ? message(context)
          : (message ?? UNKNOWN_REVERT_MESSAGE),
    };
  }
  if (isInsufficientFunds(error))
    return { kind: "funds", message: INSUFFICIENT_FUNDS_MESSAGE };
  for (const link of errorChain(error)) {
    if (
      link.name === "ContractFunctionRevertedError" ||
      link.name === "ContractFunctionZeroDataError"
    ) {
      return { kind: "contract", message: UNKNOWN_REVERT_MESSAGE };
    }
  }
  return { kind: "unknown", message: UNKNOWN_TX_MESSAGE };
}
