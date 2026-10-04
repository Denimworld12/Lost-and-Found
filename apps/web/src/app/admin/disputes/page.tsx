import type { Metadata } from "next";
import { Disputes } from "@/components/admin/disputes";
import { requireAdminPage } from "@/lib/admin-page";

export const metadata: Metadata = { title: "Disputes" };

export default async function AdminDisputesPage() {
  await requireAdminPage(["admin", "arbiter"]);
  return <Disputes />;
}
