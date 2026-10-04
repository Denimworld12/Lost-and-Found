import type { Metadata } from "next";
import { ComingSoon } from "@/components/layout/coming-soon";

export const metadata: Metadata = { title: "Report lost item" };

export default function PostPage() {
  return (
    <ComingSoon heading="Report lost item" title="Reporting opens soon.">
      Your account is set up. Posting an item and locking a reward opens in the
      next release; until then you can browse every item and audit every
      payment.
    </ComingSoon>
  );
}
