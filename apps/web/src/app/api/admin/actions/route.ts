import { count, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { logActionSchema } from "@/lib/admin";
import { actorEmails, verifyAdminTx } from "@/lib/admin-server";
import { ApiError, handler, json, parse, parseJson } from "@/lib/api";
import { requireLinkedWallet, requireRole } from "@/lib/auth";
import { adminActions, getDb, students } from "@/lib/db";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const querySchema = z.object({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

/** Admins only: the audit log, newest first, with each actor's email when Clerk has it. */
export const GET = handler(async (request: Request) => {
  await requireRole("admin");
  const params = new URL(request.url).searchParams;
  const { page, pageSize } = parse(querySchema, {
    page: params.get("page") ?? undefined,
    pageSize: params.get("pageSize") ?? undefined,
  });

  const db = getDb();
  const [rows, [{ total }]] = await Promise.all([
    db
      .select()
      .from(adminActions)
      .orderBy(desc(adminActions.createdAt), desc(adminActions.id))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db.select({ total: count() }).from(adminActions),
  ]);
  // Student actions target a Clerk user ID; show that student's email next to it.
  const studentIds = [
    ...new Set(
      rows.map((row) => row.target).filter((t) => t.startsWith("user_")),
    ),
  ];
  const [emails, targets] = await Promise.all([
    actorEmails(rows.map((row) => row.actorClerkId)),
    studentIds.length > 0
      ? db
          .select({ id: students.clerkUserId, email: students.email })
          .from(students)
          .where(inArray(students.clerkUserId, studentIds))
      : Promise.resolve([]),
  ]);
  const targetEmails = new Map(targets.map((row) => [row.id, row.email]));
  return json({
    actions: rows.map((row) => ({
      ...row,
      actorEmail: emails.get(row.actorClerkId) ?? null,
      targetEmail: targetEmails.get(row.target) ?? null,
    })),
    page,
    pageSize,
    total,
  });
});

/**
 * Records an admin write sent from the browser (dispute decision, settings, pause) once it is
 * mined. Arbiters may record dispute decisions; everything else is admin only. The entry is
 * built from the verified receipt, and a transaction is recorded once.
 */
export const POST = handler(async (request: Request) => {
  const { user, role } = await requireRole("admin", "arbiter");
  const input = await parseJson(request, logActionSchema);
  if (input.action !== "resolve_dispute" && role !== "admin")
    throw new ApiError(403, "FORBIDDEN", "You don't have access to this.");
  const wallet = requireLinkedWallet(user);

  const db = getDb();
  const [existing] = await db
    .select()
    .from(adminActions)
    .where(eq(adminActions.txHash, input.txHash))
    .limit(1);
  if (existing) return json({ action: existing });

  const { action, target } = await verifyAdminTx(input, wallet);
  const [row] = await db
    .insert(adminActions)
    .values({
      actorClerkId: user.id,
      action,
      target,
      txHash: input.txHash,
      note: input.note || null,
    })
    .returning();
  return json({ action: row }, { status: 201 });
});
