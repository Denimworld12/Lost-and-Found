import "server-only";
import { clerkClient } from "@clerk/nextjs/server";
import { and, eq, ne } from "drizzle-orm";
import { getAddress, type Address, type Hash } from "viem";
import { ApiError } from "./api";
import { adminActions, getDb, students, type Student } from "./db";
import { roleOf, STAFF_ROLES, type AppMetadata } from "./session";
import { revokeOnChain, verifyOnChain } from "./verifier";

export interface ActivationInput {
  clerkUserId: string;
  email: string;
  wallet: Address;
  publicMetadata: unknown;
}

export interface ActivationResult {
  status: "verified";
  wallet: Address;
  txHash: Hash | null;
}

export async function getStudent(clerkUserId: string): Promise<Student | null> {
  const [row] = await getDb()
    .select()
    .from(students)
    .where(eq(students.clerkUserId, clerkUserId))
    .limit(1);
  return row ?? null;
}

/**
 * Adds a college user's linked wallet to the on-chain whitelist. Idempotent: a wallet already
 * verified on-chain is recorded without a new transaction, and a repeat call returns the
 * same result.
 *
 * Order: upsert `students` (pending) → `verifyOnChain` (tx hash stored as soon as it's sent) →
 * status verified → Clerk `publicMetadata { role, wallet, onchainVerified: true }`.
 */
export async function activateStudent({
  clerkUserId,
  email,
  wallet,
  publicMetadata,
}: ActivationInput): Promise<ActivationResult> {
  const db = getDb();
  const walletLower = wallet.toLowerCase();
  const existing = await getStudent(clerkUserId);

  if (existing?.status === "revoked") {
    throw new ApiError(
      403,
      "FORBIDDEN",
      "Your access was removed by an admin. Contact campus security if you think this is a mistake.",
    );
  }

  const [taken] = await db
    .select({ clerkUserId: students.clerkUserId })
    .from(students)
    .where(
      and(
        eq(students.walletAddress, walletLower),
        ne(students.clerkUserId, clerkUserId),
      ),
    )
    .limit(1);
  if (taken) {
    throw new ApiError(
      409,
      "WALLET_TAKEN",
      "This wallet is already linked to another account. Use a different MetaMask account.",
    );
  }

  // A student who switched wallets: take the old one off the whitelist first.
  if (
    existing &&
    existing.walletAddress !== walletLower &&
    existing.status === "verified"
  ) {
    await revokeOnChain(getAddress(existing.walletAddress));
  }

  try {
    await db
      .insert(students)
      .values({
        clerkUserId,
        email,
        walletAddress: walletLower,
        status: "pending",
      })
      .onConflictDoUpdate({
        target: students.clerkUserId,
        set: {
          email,
          walletAddress: walletLower,
          status:
            existing?.walletAddress === walletLower &&
            existing.status === "verified"
              ? "verified"
              : "pending",
          error: null,
        },
      });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ApiError(
        409,
        "WALLET_TAKEN",
        "This wallet or email is already registered to another account.",
      );
    }
    throw error;
  }

  let txHash: Hash | null;
  try {
    txHash = await verifyOnChain(wallet, {
      onSent: async (hash) => {
        await db
          .update(students)
          .set({ verifyTxHash: hash })
          .where(eq(students.clerkUserId, clerkUserId));
      },
    });
  } catch (error) {
    const message =
      error instanceof ApiError ? error.message : "Verification failed.";
    await db
      .update(students)
      .set({ status: "failed", error: message })
      .where(eq(students.clerkUserId, clerkUserId));
    throw error;
  }

  await db
    .update(students)
    .set({
      status: "verified",
      error: null,
      verifiedAt:
        existing?.verifiedAt && existing.walletAddress === walletLower
          ? existing.verifiedAt
          : new Date(),
      ...(txHash ? { verifyTxHash: txHash } : {}),
    })
    .where(eq(students.clerkUserId, clerkUserId));

  await setClerkMetadata(clerkUserId, publicMetadata, {
    wallet,
    onchainVerified: true,
  });
  return { status: "verified", wallet, txHash };
}

/**
 * Merges app fields into Clerk `publicMetadata`. Staff (admin, arbiter) keep their role;
 * everyone else becomes `student`.
 */
export async function setClerkMetadata(
  clerkUserId: string,
  current: unknown,
  update: Pick<AppMetadata, "wallet" | "onchainVerified">,
): Promise<void> {
  const role = roleOf(current);
  const metadata: AppMetadata = {
    ...update,
    role: role && STAFF_ROLES.includes(role) ? role : "student",
  };
  const client = await clerkClient();
  await client.users.updateUserMetadata(clerkUserId, {
    publicMetadata: { ...metadata },
  });
}

function isUniqueViolation(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; current && depth < 3; depth++) {
    if ((current as { code?: unknown }).code === "23505") return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

/**
 * Takes a student off the whitelist: `revokeOnChain`, status revoked, Clerk metadata
 * `onchainVerified: false`, and an audit log entry. Safe to repeat.
 */
export async function revokeStudent({
  student,
  actorClerkId,
  note,
}: {
  student: Student;
  actorClerkId: string;
  note?: string;
}): Promise<{ txHash: Hash | null }> {
  const db = getDb();
  const txHash = await revokeOnChain(getAddress(student.walletAddress));
  await db
    .update(students)
    .set({ status: "revoked", revokedAt: new Date(), error: null })
    .where(eq(students.clerkUserId, student.clerkUserId));

  const client = await clerkClient();
  try {
    const user = await client.users.getUser(student.clerkUserId);
    const role = roleOf(user.publicMetadata);
    await client.users.updateUserMetadata(student.clerkUserId, {
      publicMetadata: {
        onchainVerified: false,
        role: role && STAFF_ROLES.includes(role) ? role : "student",
      },
    });
  } catch (error) {
    // A deleted Clerk account has no metadata left to update.
    if ((error as { status?: number }).status !== 404) throw error;
  }

  await db.insert(adminActions).values({
    actorClerkId,
    action: "revoke_student",
    target: student.clerkUserId,
    txHash,
    note: note ?? null,
  });
  return { txHash };
}
