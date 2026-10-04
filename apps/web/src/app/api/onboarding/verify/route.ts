import { z } from "zod";
import { handler, json, parseJson } from "@/lib/api";
import { requireCollegeUser, requireLinkedWallet } from "@/lib/auth";
import { activateStudent } from "@/lib/students";

export const dynamic = "force-dynamic";
/** Simulate + send + up to 90 s for the receipt. */
export const maxDuration = 120;

/** No input: the wallet comes from Clerk, never from the request. */
const bodySchema = z.object({}).strict();

/**
 * Activates the caller's linked wallet on-chain. Idempotent: calling it again after success
 * (or while a transaction is pending) sends no duplicate transaction for a verified wallet.
 */
export const POST = handler(async (request: Request) => {
  const { user, email } = await requireCollegeUser();
  await parseJson(request, bodySchema);
  const wallet = requireLinkedWallet(user);
  const result = await activateStudent({
    clerkUserId: user.id,
    email,
    wallet,
    publicMetadata: user.publicMetadata,
  });
  return json(result);
});
