import { handler, json } from "@/lib/api";
import { getLinkedWallet, primaryVerifiedEmail, requireUser } from "@/lib/auth";
import { verifiedWallets } from "@/lib/clerk-user";
import { getPublicClient, readIsVerified } from "@/lib/contract";
import { serverEnv } from "@/lib/env";
import { MIN_GAS_WEI, type OnboardingStatus } from "@/lib/onboarding";
import { isAllowedEmail } from "@/lib/session";
import { getStudent } from "@/lib/students";

export const dynamic = "force-dynamic";

/** Drives the onboarding stepper. Only the caller's own data. */
export const GET = handler(async () => {
  const user = await requireUser();
  const email = primaryVerifiedEmail(user);
  const emailOk = isAllowedEmail(email, serverEnv.allowedEmailDomains());
  const wallet = getLinkedWallet(user);

  const [student, onchainVerified, balance] = await Promise.all([
    emailOk ? getStudent(user.id) : null,
    wallet ? readIsVerified(wallet) : false,
    wallet ? getPublicClient().getBalance({ address: wallet }) : null,
  ]);

  // Show the row only while it describes the wallet linked now.
  const current =
    student && wallet && student.walletAddress === wallet.toLowerCase()
      ? student
      : null;

  const body: OnboardingStatus = {
    email,
    emailOk,
    walletLinked: wallet !== null,
    multipleWallets: verifiedWallets(user).length > 1,
    wallet,
    studentStatus:
      student?.status === "revoked" ? "revoked" : (current?.status ?? "none"),
    onchainVerified,
    balance: balance === null ? null : balance.toString(),
    hasGas: balance !== null && balance >= MIN_GAS_WEI,
    verifyTxHash:
      (current?.verifyTxHash as OnboardingStatus["verifyTxHash"]) ?? null,
    error: current?.status === "failed" ? current.error : null,
  };
  return json(body, { headers: { "cache-control": "no-store" } });
});
