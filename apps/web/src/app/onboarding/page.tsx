import { currentUser } from "@clerk/nextjs/server";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { OnboardingStepper } from "@/components/onboarding/onboarding-stepper";
import { primaryVerifiedEmail } from "@/lib/clerk-user";
import { parseAllowedDomains } from "@/lib/env";
import { isAllowedEmail } from "@/lib/session";

export const metadata: Metadata = { title: "Set up your account" };

export default async function OnboardingPage() {
  const user = await currentUser();
  if (!user) redirect("/sign-in");

  // Second check behind the proxy, from fresh Clerk data (the session token can lag).
  const domains = parseAllowedDomains(process.env.ALLOWED_EMAIL_DOMAIN ?? "");
  if (
    domains.length > 0 &&
    !isAllowedEmail(primaryVerifiedEmail(user), domains)
  ) {
    redirect("/not-eligible");
  }

  return (
    <div className="page-x flex flex-col gap-24 py-48">
      <div className="flex flex-wrap items-baseline justify-between gap-12">
        <h1 className="text-heading-sm md:text-heading">Set up your account</h1>
        <p className="font-mono text-caption text-cloud uppercase">
          Takes about 2 minutes
        </p>
      </div>
      <OnboardingStepper />
    </div>
  );
}
