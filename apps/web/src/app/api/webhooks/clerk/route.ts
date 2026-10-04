import { clerkClient } from "@clerk/nextjs/server";
import { verifyWebhook } from "@clerk/nextjs/webhooks";
import { eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { getAddress } from "viem";
import { errorResponse, handler, json } from "@/lib/api";
import { fromUserJson, primaryVerifiedEmail } from "@/lib/clerk-user";
import { adminActions, getDb, students } from "@/lib/db";
import { serverEnv } from "@/lib/env";
import { isAllowedEmail, type AppMetadata } from "@/lib/session";
import { getStudent } from "@/lib/students";
import { revokeOnChain } from "@/lib/verifier";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * Clerk webhooks (`user.created`, `user.updated`, `user.deleted`), verified with the Svix
 * signature on the raw request. A non-2xx reply makes Clerk retry, so failures that may clear
 * (chain or database down) return 5xx and verified-but-irrelevant events return 200.
 */
export const POST = handler(async (request: NextRequest) => {
  let event;
  try {
    event = await verifyWebhook(request);
  } catch {
    return errorResponse(400, "BAD_REQUEST", "Webhook signature is invalid.");
  }

  switch (event.type) {
    case "user.created":
    case "user.updated": {
      // Free-plan Clerk has no domain allowlist, so we flag accounts outside the college
      // domain; the proxy sends them to /not-eligible.
      const user = fromUserJson(event.data);
      const email = primaryVerifiedEmail(user);
      const ineligible = !isAllowedEmail(
        email,
        serverEnv.allowedEmailDomains(),
      );
      const metadata = (user.publicMetadata ?? {}) as AppMetadata;
      // Only write when the flag changes: every write fires another `user.updated`.
      if (Boolean(metadata.ineligible) !== ineligible) {
        const client = await clerkClient();
        await client.users.updateUserMetadata(user.id, {
          publicMetadata: { ineligible },
        });
      }
      return json({ ok: true });
    }
    case "user.deleted": {
      const id = event.data.id;
      if (!id) return json({ ok: true });
      const student = await getStudent(id);
      if (!student || student.status === "revoked") return json({ ok: true });
      const txHash = await revokeOnChain(getAddress(student.walletAddress));
      const db = getDb();
      await db
        .update(students)
        .set({ status: "revoked", revokedAt: new Date(), error: null })
        .where(eq(students.clerkUserId, id));
      await db.insert(adminActions).values({
        actorClerkId: "clerk-webhook",
        action: "revoke_student",
        target: id,
        txHash,
        note: "Clerk account deleted",
      });
      return json({ ok: true, txHash });
    }
    default:
      return json({ ok: true, ignored: event.type });
  }
});
