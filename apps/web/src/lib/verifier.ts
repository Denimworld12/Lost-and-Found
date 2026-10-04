import "server-only";
import {
  BaseError,
  createWalletClient,
  http,
  nonceManager,
  type Account,
  type Address,
  type Chain,
  type Hash,
  type PublicClient,
  type Transport,
  type WalletClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { withAdvisoryLock, type LockOptions } from "./advisory-lock";
import { ApiError } from "./api";
import { appChain, rpcUrl } from "./chain";
import { getPublicClient, lostAndFound, readIsVerified } from "./contract";
import { getPool } from "./db";
import { serverEnv } from "./env";

/**
 * The verifier wallet (holder of `VERIFIER_ROLE`) signs `verifyStudent` / `revokeStudent`
 * from the server. Never import this file from client code.
 */

/** Advisory lock key that serialises every verifier transaction across server instances. */
export const VERIFIER_LOCK_KEY = 42;
export const RECEIPT_TIMEOUT_MS = 90_000;

type VerifierWallet = WalletClient<Transport, Chain, Account>;

export interface VerifierDeps {
  publicClient: PublicClient;
  walletClient: VerifierWallet;
  /** Runs `fn` while no other verifier send is in flight. */
  lock: <T>(fn: () => Promise<T>) => Promise<T>;
}

export interface SendOptions {
  /** Called as soon as the transaction is broadcast, before the receipt arrives. */
  onSent?: (hash: Hash) => Promise<void> | void;
}

export interface Verifier {
  /** Whitelists `student`. Returns the tx hash, or `null` if it was already verified. */
  verifyOnChain(student: Address, options?: SendOptions): Promise<Hash | null>;
  /** Removes `student` from the whitelist. Returns the tx hash, or `null` if it wasn't verified. */
  revokeOnChain(student: Address, options?: SendOptions): Promise<Hash | null>;
}

export function createVerifier({
  publicClient,
  walletClient,
  lock,
}: VerifierDeps): Verifier {
  async function send(
    functionName: "verifyStudent" | "revokeStudent",
    student: Address,
    wantVerified: boolean,
    { onSent }: SendOptions,
  ): Promise<Hash | null> {
    // Cheap check before queueing for the lock, then again inside it: another request may
    // have sent the same transaction while this one waited.
    if ((await readIsVerified(student, publicClient)) === wantVerified)
      return null;
    const hash = await lock(async () => {
      if ((await readIsVerified(student, publicClient)) === wantVerified)
        return null;
      const { request } = await publicClient.simulateContract({
        account: walletClient.account,
        address: lostAndFound.address,
        abi: lostAndFound.abi,
        functionName,
        args: [student],
      });
      return walletClient.writeContract(request);
    });
    if (!hash) return null;
    await onSent?.(hash);
    const receipt = await publicClient.waitForTransactionReceipt({
      hash,
      timeout: RECEIPT_TIMEOUT_MS,
    });
    if (receipt.status !== "success") {
      throw new ApiError(
        502,
        "CHAIN_ERROR",
        "The blockchain transaction failed. Try again in a minute.",
        `${functionName} reverted in ${hash}`,
      );
    }
    return hash;
  }

  return {
    verifyOnChain: (student, options = {}) =>
      send("verifyStudent", student, true, options).catch(rethrowChainError),
    revokeOnChain: (student, options = {}) =>
      send("revokeStudent", student, false, options).catch(rethrowChainError),
  };
}

/** Keeps `ApiError`s; turns viem errors into a safe message (details go to the server log only). */
function rethrowChainError(error: unknown): never {
  if (error instanceof ApiError) throw error;
  const detail =
    error instanceof BaseError
      ? error.shortMessage
      : error instanceof Error
        ? `${error.name}: ${error.message}`
        : String(error);
  throw new ApiError(
    502,
    "CHAIN_ERROR",
    "We couldn't reach the blockchain to update the student list. Try again in a minute.",
    detail,
  );
}

const PRIVATE_KEY = /^0x[0-9a-fA-F]{64}$/;

let verifier: Verifier | undefined;

/** The app's verifier: `VERIFIER_PRIVATE_KEY` with viem's nonce manager, locked by Postgres. */
export function getVerifier(): Verifier {
  if (verifier) return verifier;
  const raw = serverEnv.verifierPrivateKey();
  const key = raw.startsWith("0x") ? raw : `0x${raw}`;
  if (!PRIVATE_KEY.test(key)) {
    throw new ApiError(
      503,
      "NOT_CONFIGURED",
      "This feature isn't set up on the server yet. Try again later.",
      "VERIFIER_PRIVATE_KEY is not a 32-byte hex key",
    );
  }
  const account = privateKeyToAccount(key as Hash, { nonceManager });
  const walletClient = createWalletClient({
    account,
    chain: appChain,
    transport: http(rpcUrl(), { retryCount: 2 }),
  });
  verifier = createVerifier({
    publicClient: getPublicClient(),
    walletClient,
    lock: (fn) => withPoolLock(fn),
  });
  return verifier;
}

async function withPoolLock<T>(
  fn: () => Promise<T>,
  options?: LockOptions,
): Promise<T> {
  const client = await getPool().connect();
  try {
    return await withAdvisoryLock(client, VERIFIER_LOCK_KEY, fn, options);
  } catch (error) {
    if (error instanceof Error && error.name === "LockTimeoutError") {
      throw new ApiError(
        503,
        "CHAIN_ERROR",
        "Lots of students are activating right now. Try again in a minute.",
        error.message,
      );
    }
    throw error;
  } finally {
    client.release();
  }
}

export const verifyOnChain: Verifier["verifyOnChain"] = (student, options) =>
  getVerifier().verifyOnChain(student, options);

export const revokeOnChain: Verifier["revokeOnChain"] = (student, options) =>
  getVerifier().revokeOnChain(student, options);
