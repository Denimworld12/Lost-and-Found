import "server-only";
import { clerkClient } from "@clerk/nextjs/server";
import type { Item } from "@clf/shared";
import { inArray } from "drizzle-orm";
import {
  isAddressEqual,
  parseEventLogs,
  type Address,
  type PublicClient,
  type TransactionReceipt,
} from "viem";
import {
  configTarget,
  disputeAction,
  type AuditAction,
  type logActionSchema,
} from "./admin";
import { ApiError } from "./api";
import { primaryVerifiedEmail } from "./clerk-user";
import {
  getPublicClient,
  lostAndFound,
  readItemCount,
  readItems,
} from "./contract";
import { getDb, students } from "./db";
import type { z } from "zod";

/** Server side of the admin console (PLAN.md Phase 9). Never import from client code. */

export type LogAction = z.output<typeof logActionSchema>;

/** How long to wait for the receipt of a transaction the browser says is mined. */
const RECEIPT_WAIT_MS = 30_000;

/**
 * Checks that `txHash` is a successful call to our contract, sent from `sender` (the caller's
 * linked wallet), that emitted the event `input` describes. Returns what to write in
 * `admin_actions`. The browser's word is never enough: the log entry comes from the receipt.
 */
export async function verifyAdminTx(
  input: LogAction,
  sender: Address,
  publicClient: PublicClient = getPublicClient(),
): Promise<{ action: AuditAction; target: string }> {
  let receipt: TransactionReceipt;
  try {
    receipt = await publicClient.waitForTransactionReceipt({
      hash: input.txHash,
      timeout: RECEIPT_WAIT_MS,
    });
  } catch {
    throw new ApiError(
      409,
      "CONFLICT",
      "We couldn't find that transaction on the blockchain yet. Try again in a minute.",
    );
  }
  if (receipt.status !== "success") {
    throw new ApiError(
      409,
      "CONFLICT",
      "That transaction failed on the blockchain, so there's nothing to record.",
    );
  }
  if (!receipt.to || !isAddressEqual(receipt.to, lostAndFound.address)) {
    throw new ApiError(
      400,
      "BAD_REQUEST",
      "That transaction wasn't sent to the Lost & Found contract.",
    );
  }
  if (!isAddressEqual(receipt.from, sender)) {
    throw new ApiError(
      403,
      "FORBIDDEN",
      "That transaction wasn't sent from the wallet linked to your account.",
    );
  }

  const events = parseEventLogs({
    abi: lostAndFound.abi,
    logs: receipt.logs.filter((log) =>
      isAddressEqual(log.address, lostAndFound.address),
    ),
  });
  const mismatch = () =>
    new ApiError(
      400,
      "BAD_REQUEST",
      "That transaction doesn't match the action you're recording.",
    );

  switch (input.action) {
    case "resolve_dispute": {
      const resolved = events.find(
        (event) =>
          event.eventName === "DisputeResolved" &&
          event.args.id === input.itemId &&
          event.args.finderWins === input.finderWins,
      );
      if (!resolved) throw mismatch();
      return {
        action: disputeAction(input.finderWins),
        target: input.itemId.toString(),
      };
    }
    case "set_config": {
      const updated = events.find(
        (event) => event.eventName === "ConfigUpdated",
      );
      if (!updated || updated.eventName !== "ConfigUpdated") throw mismatch();
      return {
        action: "set_config",
        target: configTarget({
          minReward: updated.args.minReward,
          claimStake: updated.args.claimStake,
          confirmWindow: BigInt(updated.args.confirmWindow),
        }),
      };
    }
    case "pause":
    case "unpause": {
      const eventName = input.action === "pause" ? "Paused" : "Unpaused";
      if (!events.some((event) => event.eventName === eventName))
        throw mismatch();
      return { action: input.action, target: "contract" };
    }
  }
}

// ─────────────────────────────────────────────────────────────── Disputes

/** Items per `getItem` multicall when reading every item. */
const ITEM_CHUNK = 200;

export interface Dispute {
  item: Item;
  /** College emails from `students`; `null` if the wallet has no row (e.g. activated by script). */
  ownerEmail: string | null;
  finderEmail: string | null;
}

/**
 * Every item in `Disputed` status, oldest first, with both parties' college emails. Reads all
 * items (not just the latest 50) so an old dispute is never missed.
 */
export async function listDisputes(
  publicClient: PublicClient = getPublicClient(),
): Promise<Dispute[]> {
  const count = await readItemCount(publicClient);
  const disputed: Item[] = [];
  for (let start = 1n; start <= count; start += BigInt(ITEM_CHUNK)) {
    const ids: bigint[] = [];
    for (let id = start; id < start + BigInt(ITEM_CHUNK) && id <= count; id++)
      ids.push(id);
    const items = await readItems(ids, publicClient);
    disputed.push(...items.filter((item) => item.status === "Disputed"));
  }
  if (disputed.length === 0) return [];

  const wallets = [
    ...new Set(
      disputed.flatMap((item) =>
        [item.owner, item.finder]
          .filter((address): address is Address => address !== null)
          .map((address) => address.toLowerCase()),
      ),
    ),
  ];
  const rows = await getDb()
    .select({ wallet: students.walletAddress, email: students.email })
    .from(students)
    .where(inArray(students.walletAddress, wallets));
  const emails = new Map(rows.map((row) => [row.wallet, row.email]));
  const emailOf = (address: Address | null) =>
    address ? (emails.get(address.toLowerCase()) ?? null) : null;

  return disputed.map((item) => ({
    item,
    ownerEmail: emailOf(item.owner),
    finderEmail: emailOf(item.finder),
  }));
}

// ─────────────────────────────────────────────────────────────── Audit log

/**
 * Primary emails of the Clerk users who wrote audit rows, for display. A lookup failure
 * leaves them out (the table then shows the user ID); it never fails the page.
 */
export async function actorEmails(
  ids: readonly string[],
): Promise<Map<string, string>> {
  const userIds = [...new Set(ids.filter((id) => id.startsWith("user_")))];
  const result = new Map<string, string>();
  if (userIds.length === 0) return result;
  try {
    const client = await clerkClient();
    const { data } = await client.users.getUserList({
      userId: userIds,
      limit: userIds.length,
    });
    for (const user of data) {
      const email =
        primaryVerifiedEmail(user) ??
        user.primaryEmailAddress?.emailAddress ??
        null;
      if (email) result.set(user.id, email);
    }
  } catch (error) {
    console.error(
      "[admin] couldn't load actor emails:",
      error instanceof Error ? error.message : error,
    );
  }
  return result;
}
