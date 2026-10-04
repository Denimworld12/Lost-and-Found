"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NodeDot } from "@/components/item/node-dot";
import { Button } from "@/components/ui/button";
import { useRole } from "@/hooks/useRole";

const HIDDEN_ON = ["/onboarding", "/not-eligible", "/sign-in", "/sign-up"];

/** Carbon strip under the nav for signed-in students who haven't finished setup. */
export function SetupBanner() {
  const pathname = usePathname();
  const { isLoaded, isSignedIn, onchainVerified, ineligible } = useRole();
  if (
    !isLoaded ||
    !isSignedIn ||
    onchainVerified ||
    ineligible ||
    HIDDEN_ON.some(
      (path) => pathname === path || pathname.startsWith(`${path}/`),
    )
  ) {
    return null;
  }
  return (
    <div className="border-b border-charcoal bg-carbon">
      <div className="page-x flex min-h-48 flex-wrap items-center gap-x-12 gap-y-4 py-4">
        <NodeDot tone="cyan" />
        <p className="text-body-sm text-snow">
          Finish setting up to post or claim
        </p>
        <Button asChild variant="quiet" size="sm" className="ml-auto">
          <Link href="/onboarding">Continue setup</Link>
        </Button>
      </div>
    </div>
  );
}
