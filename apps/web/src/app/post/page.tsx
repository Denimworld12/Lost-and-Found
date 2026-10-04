import type { Metadata } from "next";
import { ComingSoon } from "@/components/layout/coming-soon";

export const metadata: Metadata = { title: "Report lost item" };

export default function PostPage() {
  return (
    <ComingSoon heading="Report lost item" title="Reporting opens soon.">
      Students will sign in with their college account and connect MetaMask to
      post an item and lock a reward. Until then you can browse every item and
      audit every payment.
    </ComingSoon>
  );
}
