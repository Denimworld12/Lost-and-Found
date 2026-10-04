import "server-only";
import { auth, currentUser, type User } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import type { Address } from "viem";
import { ApiError } from "./api";
import {
  getLinkedWallet,
  primaryVerifiedEmail,
  verifiedWallets,
} from "./clerk-user";
import { readIsVerified } from "./contract";
import { getDb, students, type Student } from "./db";
import { serverEnv } from "./env";
import { isAllowedEmail, roleOf, type Role } from "./session";

export { getLinkedWallet, primaryVerifiedEmail } from "./clerk-user";

/**
 * Server-side checks for route handlers. Each throws an `ApiError` (turned into a typed JSON
 * error by `handler()`); none trusts role or wallet data sent by the client.
 */

/** The signed-in Clerk user, read fresh from Clerk, or 401. */
export async function requireUser(): Promise<User> {
  const { userId } = await auth();
  if (!userId) throw unauthenticated();
  const user = await currentUser();
  if (!user) throw unauthenticated();
  return user;
}

/** True when the user's verified primary email is on an allowed college domain. */
export function isCollegeUser(user: User): boolean {
  return isAllowedEmail(
    primaryVerifiedEmail(user),
    serverEnv.allowedEmailDomains(),
  );
}

/** Signed in with a verified primary email on the college domain, or 403. */
export async function requireCollegeUser(): Promise<{
  user: User;
  email: string;
}> {
  const user = await requireUser();
  const email = primaryVerifiedEmail(user);
  if (!email || !isAllowedEmail(email, serverEnv.allowedEmailDomains())) {
    throw new ApiError(
      403,
      "NOT_ELIGIBLE",
      "Only college email accounts can use MilGaya.",
    );
  }
  return { user, email };
}

/** The college user's single linked wallet, or 403. */
export function requireLinkedWallet(user: User): Address {
  const wallet = getLinkedWallet(user);
  if (wallet) return wallet;
  if (verifiedWallets(user).length > 1) {
    throw new ApiError(
      409,
      "MULTIPLE_WALLETS",
      "More than one wallet is linked to your account. Remove the extra one in your account settings.",
    );
  }
  throw new ApiError(
    403,
    "WALLET_NOT_LINKED",
    "Link your MetaMask wallet to your account first.",
  );
}

export interface VerifiedStudent {
  user: User;
  email: string;
  wallet: Address;
  student: Student;
}

/**
 * A college user whose linked wallet matches a `verified` students row **and** is whitelisted
 * on-chain, or 403.
 */
export async function requireVerifiedStudent(): Promise<VerifiedStudent> {
  const { user, email } = await requireCollegeUser();
  const wallet = requireLinkedWallet(user);
  const [student] = await getDb()
    .select()
    .from(students)
    .where(eq(students.clerkUserId, user.id))
    .limit(1);
  const onchain = student ? await readIsVerified(wallet) : false;
  if (
    !student ||
    student.status !== "verified" ||
    student.walletAddress !== wallet.toLowerCase() ||
    !onchain
  ) {
    throw new ApiError(
      403,
      "NOT_VERIFIED",
      "Finish setting up your account before you post or claim.",
    );
  }
  return { user, email, wallet, student };
}

/** A user whose Clerk `publicMetadata.role` is one of `roles`, or 403. */
export async function requireRole(
  ...roles: [Role, ...Role[]]
): Promise<{ user: User; role: Role }> {
  const user = await requireUser();
  const role = roleOf(user.publicMetadata);
  if (!role || !roles.includes(role)) {
    throw new ApiError(403, "FORBIDDEN", "You don't have access to this.");
  }
  return { user, role };
}

function unauthenticated() {
  return new ApiError(401, "UNAUTHENTICATED", "Sign in to continue.");
}
