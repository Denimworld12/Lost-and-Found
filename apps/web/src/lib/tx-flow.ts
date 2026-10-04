import {
  getAddress,
  isAddressEqual,
  type Address,
  type Hash,
  type TransactionReceipt,
} from "viem";
import {
  CONTRACT_ERROR_MESSAGES,
  describeTxError,
  INSUFFICIENT_FUNDS_MESSAGE,
  isUserRejection,
  USER_REJECTED_MESSAGE,
  type TxErrorContext,
} from "./errors";
import { shortAddress } from "./format";

/**
 * The one path every on-chain write takes (PLAN.md Phase 8 → `useTxFlow`). Pure: the wallet,
 * chain and RPC calls come in as `TxFlowDeps`, so the hook wires wagmi in and tests use fakes.
 *
 * idle → checking → awaitingWallet → pending → confirmed | failed | cancelled
 */
export type TxState =
  | "idle"
  | "checking"
  | "awaitingWallet"
  | "pending"
  | "confirmed"
  | "failed"
  | "cancelled";

/** LostAndFound functions the app writes. */
export type WriteFunctionName =
  | "postItem"
  | "claimItem"
  | "confirmReturn"
  | "rejectClaim"
  | "raiseDispute"
  | "claimAfterTimeout"
  | "cancelItem"
  | "withdraw";

export interface TxCall {
  functionName: WriteFunctionName;
  args: readonly unknown[];
  /** Wei sent with the call (reward or deposit). */
  value?: bigint;
}

export interface TxRequest extends TxCall {
  /** Item the write changes; its queries are refreshed after the receipt. */
  itemId?: bigint;
  /** Past-tense success toast, e.g. "Claim sent". */
  successMessage: string;
  errorContext?: TxErrorContext;
  /**
   * Runs once the wallet checks pass and before the gas estimate, and returns the final call
   * (the post flow uploads the photo here and gets the CID). Its error message is shown as is.
   */
  prepare?: () => Promise<Partial<TxCall>>;
}

/** The step a `TxPanel` row tracks; `prepare` runs inside `checking`. */
export type TxStep =
  "checking" | "prepare" | "awaitingWallet" | "pending" | "confirmed";

export interface TxSnapshot {
  state: TxState;
  /** The step reached (or stopped at). */
  step: TxStep;
  /** True once `prepare` has finished. */
  prepared: boolean;
  hash: Hash | null;
  /** Copy for `failed` and `cancelled`. */
  error: string | null;
  receipt: TransactionReceipt | null;
}

export const IDLE_SNAPSHOT: TxSnapshot = {
  state: "idle",
  step: "checking",
  prepared: false,
  hash: null,
  error: null,
  receipt: null,
};

export interface TxConnection {
  address?: Address;
  chainId?: number;
}

export interface TxFlowDeps {
  /** Chain ID the app writes to. */
  chainId: number;
  /** Wallet linked to the signed-in Clerk account; writes must come from it. */
  linkedWallet: Address | null;
  getConnection: () => TxConnection;
  switchChain: (chainId: number) => Promise<unknown>;
  estimateGas: (call: TxCall & { account: Address }) => Promise<bigint>;
  /** Highest fee per gas the wallet may charge (EIP-1559 `maxFeePerGas`). */
  maxFeePerGas: () => Promise<bigint>;
  getBalance: (address: Address) => Promise<bigint>;
  /** `simulateContract`; returns the request to hand to the wallet. */
  simulate: (call: TxCall & { account: Address }) => Promise<unknown>;
  write: (request: unknown) => Promise<Hash>;
  waitForReceipt: (hash: Hash) => Promise<TransactionReceipt>;
}

export const NOT_CONNECTED_MESSAGE = "Connect MetaMask to continue.";
export const WRONG_CHAIN_MESSAGE = "Switch MetaMask to Sepolia and try again.";
export const REVERTED_MESSAGE =
  "The transaction failed on the blockchain. Check Etherscan for details.";
export const RECEIPT_TIMEOUT_MESSAGE =
  "We couldn't confirm the transaction yet. Check Etherscan, then refresh.";

export function wrongWalletMessage(linked: Address): string {
  return `Switch MetaMask to your registered wallet ${shortAddress(linked)}.`;
}

/** Hashes sent from this tab, so live updates don't announce the viewer's own actions. */
export const ownTxHashes = new Set<Hash>();

/**
 * Runs one write through every check, reporting each state change to `onUpdate`. Never
 * throws: the result is the final snapshot (`confirmed`, `failed` or `cancelled`).
 */
export async function executeTx(
  deps: TxFlowDeps,
  request: TxRequest,
  onUpdate: (snapshot: TxSnapshot) => void,
): Promise<TxSnapshot> {
  let snapshot: TxSnapshot = { ...IDLE_SNAPSHOT };
  const update = (patch: Partial<TxSnapshot>) => {
    snapshot = { ...snapshot, ...patch };
    onUpdate(snapshot);
    return snapshot;
  };
  const fail = (error: string) => update({ state: "failed", error });
  const cancel = () =>
    update({ state: "cancelled", error: USER_REJECTED_MESSAGE });
  const failWith = (error: unknown) => {
    const info = describeTxError(error, request.errorContext);
    return info.kind === "rejected" ? cancel() : fail(info.message);
  };

  // ── checking
  update({ state: "checking" });
  let { address, chainId } = deps.getConnection();
  if (!address) return fail(NOT_CONNECTED_MESSAGE);

  if (chainId !== deps.chainId) {
    try {
      await deps.switchChain(deps.chainId);
    } catch (error) {
      return isUserRejection(error) ? cancel() : fail(WRONG_CHAIN_MESSAGE);
    }
    ({ address, chainId } = deps.getConnection());
    if (!address) return fail(NOT_CONNECTED_MESSAGE);
    if (chainId !== deps.chainId) return fail(WRONG_CHAIN_MESSAGE);
  }

  // A signed-in student without a linked wallet hasn't finished activation.
  if (!deps.linkedWallet)
    return fail(CONTRACT_ERROR_MESSAGES.NotVerified as string);
  if (!isAddressEqual(address, deps.linkedWallet))
    return fail(wrongWalletMessage(deps.linkedWallet));
  const account = getAddress(address);

  let call: TxCall = {
    functionName: request.functionName,
    args: request.args,
    value: request.value,
  };
  if (request.prepare) {
    update({ step: "prepare" });
    try {
      call = { ...call, ...(await request.prepare()) };
    } catch (error) {
      return fail(
        error instanceof Error && error.message
          ? error.message
          : "Something went wrong. Try again.",
      );
    }
    update({ step: "checking", prepared: true });
  }

  try {
    const [gas, maxFee, balance] = await Promise.all([
      deps.estimateGas({ ...call, account }),
      deps.maxFeePerGas(),
      deps.getBalance(account),
    ]);
    if (gas * maxFee + (call.value ?? 0n) > balance)
      return fail(INSUFFICIENT_FUNDS_MESSAGE);
  } catch (error) {
    return failWith(error);
  }

  let writeRequest: unknown;
  try {
    writeRequest = await deps.simulate({ ...call, account });
  } catch (error) {
    return failWith(error);
  }

  // ── awaitingWallet
  update({ state: "awaitingWallet", step: "awaitingWallet" });
  let hash: Hash;
  try {
    hash = await deps.write(writeRequest);
  } catch (error) {
    return failWith(error);
  }
  ownTxHashes.add(hash);

  // ── pending
  update({ state: "pending", step: "pending", hash });
  let receipt: TransactionReceipt;
  try {
    receipt = await deps.waitForReceipt(hash);
  } catch {
    return fail(RECEIPT_TIMEOUT_MESSAGE);
  }
  if (receipt.status === "reverted")
    return update({ state: "failed", error: REVERTED_MESSAGE, receipt });

  // ── confirmed
  return update({ state: "confirmed", step: "confirmed", receipt });
}
