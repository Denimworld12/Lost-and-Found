import { listDisputes } from "@/lib/admin-server";
import { handler, json } from "@/lib/api";
import { requireRole } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Admins and arbiters: every disputed item with both parties' college emails. */
export const GET = handler(async () => {
  await requireRole("admin", "arbiter");
  const disputes = await listDisputes();
  return json(
    { disputes },
    { headers: { "cache-control": "private, no-store" } },
  );
});
