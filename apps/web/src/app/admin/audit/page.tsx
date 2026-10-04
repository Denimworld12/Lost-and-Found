import type { Metadata } from "next";
import { AuditLog } from "@/components/admin/audit-log";
import { requireAdminPage } from "@/lib/admin-page";

export const metadata: Metadata = { title: "Audit log" };

export default async function AdminAuditPage() {
  await requireAdminPage();
  return <AuditLog />;
}
