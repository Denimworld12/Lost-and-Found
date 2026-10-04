import { clerkClient } from "@clerk/nextjs/server";
import { ApiError, handler, json, parseJson, parseParams } from "@/lib/api";
import { adminActionSchema, studentParamsSchema } from "@/lib/admin";
import { requireRole } from "@/lib/auth";
import { getLinkedWallet, primaryVerifiedEmail } from "@/lib/clerk-user";
import { adminActions, getDb } from "@/lib/db";
import { serverEnv } from "@/lib/env";
import { isAllowedEmail } from "@/lib/session";
import { activateStudent, getStudent } from "@/lib/students";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** Admins only: re-runs a failed (or stuck pending) verification with the student's current Clerk data. */
export const POST = handler(
  async (
    request: Request,
    context: RouteContext<"/api/admin/students/[id]/retry">,
  ) => {
    const { user: admin } = await requireRole("admin");
    const { id } = await parseParams(context.params, studentParamsSchema);
    const { note } = await parseJson(request, adminActionSchema);

    const student = await getStudent(id);
    if (!student)
      throw new ApiError(404, "NOT_FOUND", "We couldn't find that student.");
    if (student.status !== "failed" && student.status !== "pending") {
      throw new ApiError(
        409,
        "CONFLICT",
        `Only failed or pending verifications can be retried; this one is ${student.status}.`,
      );
    }

    const client = await clerkClient();
    let target;
    try {
      target = await client.users.getUser(id);
    } catch (error) {
      if ((error as { status?: number }).status === 404) {
        throw new ApiError(
          404,
          "NOT_FOUND",
          "That student's account no longer exists.",
        );
      }
      throw error;
    }

    const email = primaryVerifiedEmail(target);
    if (!email || !isAllowedEmail(email, serverEnv.allowedEmailDomains())) {
      throw new ApiError(
        409,
        "NOT_ELIGIBLE",
        "That account's email isn't on the college domain.",
      );
    }
    const wallet = getLinkedWallet(target);
    if (!wallet) {
      throw new ApiError(
        409,
        "WALLET_NOT_LINKED",
        "That student has no single linked wallet. They need to link one in onboarding.",
      );
    }

    const result = await activateStudent({
      clerkUserId: id,
      email,
      wallet,
      publicMetadata: target.publicMetadata,
    });
    await getDb()
      .insert(adminActions)
      .values({
        actorClerkId: admin.id,
        action: "retry_verification",
        target: id,
        txHash: result.txHash,
        note: note ?? null,
      });
    return json(result);
  },
);
