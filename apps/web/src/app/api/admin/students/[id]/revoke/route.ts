import { ApiError, handler, json, parseJson, parseParams } from "@/lib/api";
import { adminActionSchema, studentParamsSchema } from "@/lib/admin";
import { requireRole } from "@/lib/auth";
import { getStudent, revokeStudent } from "@/lib/students";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** Admins only: removes a student's wallet from the on-chain whitelist. */
export const POST = handler(
  async (
    request: Request,
    context: RouteContext<"/api/admin/students/[id]/revoke">,
  ) => {
    const { user } = await requireRole("admin");
    const { id } = await parseParams(context.params, studentParamsSchema);
    const { note } = await parseJson(request, adminActionSchema);

    const student = await getStudent(id);
    if (!student)
      throw new ApiError(404, "NOT_FOUND", "We couldn't find that student.");
    const { txHash } = await revokeStudent({
      student,
      actorClerkId: user.id,
      note,
    });
    return json({ status: "revoked", txHash });
  },
);
