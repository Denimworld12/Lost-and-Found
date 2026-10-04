import { SignOutButton } from "@clerk/nextjs";
import { currentUser } from "@clerk/nextjs/server";
import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/item/empty-state";
import { Button } from "@/components/ui/button";
import { primaryVerifiedEmail } from "@/lib/clerk-user";
import { displayDomain } from "@/lib/session";

export const metadata: Metadata = { title: "Not eligible" };

export default async function NotEligiblePage() {
  const user = await currentUser();
  const email =
    (user && primaryVerifiedEmail(user)) ??
    user?.primaryEmailAddress?.emailAddress ??
    null;
  const domain = displayDomain(process.env.ALLOWED_EMAIL_DOMAIN);
  const accounts = domain ? `@${domain} accounts` : "college email accounts";

  return (
    <div className="page-x flex flex-col gap-24 py-48">
      <h1 className="text-heading-sm md:text-heading">Not eligible</h1>
      <EmptyState
        title={`Only ${accounts} can use MilGaya.`}
        action={
          user ? (
            <SignOutButton redirectUrl="/sign-in">
              <Button>Sign out and try another account</Button>
            </SignOutButton>
          ) : (
            <Button asChild>
              <Link href="/sign-in">Sign in</Link>
            </Button>
          )
        }
      >
        {email ? (
          <p>
            You signed in as <span className="text-snow">{email}</span>.
          </p>
        ) : (
          <p>Sign in with your college Google account to post or claim.</p>
        )}
      </EmptyState>
    </div>
  );
}
