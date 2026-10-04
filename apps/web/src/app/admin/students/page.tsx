import type { Metadata } from "next";
import { Students } from "@/components/admin/students";
import { requireAdminPage } from "@/lib/admin-page";

export const metadata: Metadata = { title: "Students" };

export default async function AdminStudentsPage() {
  await requireAdminPage();
  return <Students />;
}
