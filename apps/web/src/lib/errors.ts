/**
 * Plain-English messages for errors the browser sees. Phase 8 adds the contract's custom errors.
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
