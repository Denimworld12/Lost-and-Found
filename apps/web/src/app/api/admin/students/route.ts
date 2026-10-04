import { and, count, desc, eq, ilike, or, type SQL } from "drizzle-orm";
import { z } from "zod";
import { handler, json, parse } from "@/lib/api";
import { requireRole } from "@/lib/auth";
import { getDb, students } from "@/lib/db";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  q: z.string().trim().max(100).optional(),
  status: z.enum(["pending", "verified", "failed", "revoked"]).optional(),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

/** `%` and `_` are wildcards in LIKE; a search for them should match them literally. */
function likeEscape(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

/** Admins only: students, newest first, searchable by email or wallet. */
export const GET = handler(async (request: Request) => {
  await requireRole("admin");
  const params = new URL(request.url).searchParams;
  const { q, status, page, pageSize } = parse(querySchema, {
    q: params.get("q") ?? undefined,
    status: params.get("status") ?? undefined,
    page: params.get("page") ?? undefined,
    pageSize: params.get("pageSize") ?? undefined,
  });

  const filters: SQL[] = [];
  if (q) {
    const pattern = `%${likeEscape(q.toLowerCase())}%`;
    const match = or(
      ilike(students.email, pattern),
      ilike(students.walletAddress, pattern),
    );
    if (match) filters.push(match);
  }
  if (status) filters.push(eq(students.status, status));
  const where = and(...filters);

  const db = getDb();
  const [rows, [{ total }]] = await Promise.all([
    db
      .select()
      .from(students)
      .where(where)
      .orderBy(desc(students.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db.select({ total: count() }).from(students).where(where),
  ]);

  return json({ students: rows, page, pageSize, total });
});
