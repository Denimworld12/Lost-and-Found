import type { Metadata } from "next";
import { Dashboard } from "@/components/me/dashboard";

export const metadata: Metadata = { title: "My items" };

export default function MePage() {
  return (
    <div className="page-x py-32 md:py-48">
      <Dashboard />
    </div>
  );
}
