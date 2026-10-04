import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AdminShell } from "@/components/admin/admin-shell";
import { requireAdminPage } from "@/lib/admin-page";

export const metadata: Metadata = {
  title: { default: "Admin", template: "%s · Admin — Campus Lost & Found" },
  robots: { index: false },
};

export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  const role = await requireAdminPage(["admin", "arbiter"]);
  return (
    <div className="page-x py-32 md:py-48">
      <AdminShell role={role}>{children}</AdminShell>
    </div>
  );
}
