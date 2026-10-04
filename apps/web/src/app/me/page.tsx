import type { Metadata } from "next";
import { ComingSoon } from "@/components/layout/coming-soon";

export const metadata: Metadata = { title: "My items" };

export default function MePage() {
  return (
    <ComingSoon heading="My items" title="Your dashboard opens soon.">
      Your items, claims and withdrawable balance will show here once posting
      and claiming open.
    </ComingSoon>
  );
}
