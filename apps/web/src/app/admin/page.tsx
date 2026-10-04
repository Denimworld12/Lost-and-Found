import { Overview } from "@/components/admin/overview";
import { requireAdminPage } from "@/lib/admin-page";

export default async function AdminOverviewPage() {
  await requireAdminPage();
  return <Overview />;
}
