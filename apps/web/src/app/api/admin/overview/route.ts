import { count } from "drizzle-orm";
import { handler, json } from "@/lib/api";
import { requireRole } from "@/lib/auth";
import { getPublicClient } from "@/lib/contract";
import { getDb, students, type StudentStatus } from "@/lib/db";
import { verifierAddress } from "@/lib/verifier";

export const dynamic = "force-dynamic";

/** Admins only: the verifier wallet's balance and student counts by status. */
export const GET = handler(async () => {
  await requireRole("admin");
  const address = verifierAddress();
  const [balance, rows] = await Promise.all([
    getPublicClient().getBalance({ address }),
    getDb()
      .select({ status: students.status, total: count() })
      .from(students)
      .groupBy(students.status),
  ]);
  const totals: Record<StudentStatus, number> = {
    pending: 0,
    verified: 0,
    failed: 0,
    revoked: 0,
  };
  for (const row of rows) totals[row.status] = row.total;
  return json({ verifier: { address, balance }, students: totals });
});
