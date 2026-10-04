import type { Metadata } from "next";
import { Settings } from "@/components/admin/settings";
import { requireAdminPage } from "@/lib/admin-page";

export const metadata: Metadata = { title: "Settings" };

export default async function AdminSettingsPage() {
  await requireAdminPage();
  return <Settings />;
}
