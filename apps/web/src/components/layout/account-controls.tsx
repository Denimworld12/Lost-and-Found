"use client";

import { UserButton, useAuth } from "@clerk/nextjs";
import Link from "next/link";
import { Button } from "@/components/ui/button";

/** Header account slot: "Sign in" Ghost pill when logged out, the Clerk avatar menu when signed in. */
export function AccountControls() {
  const { isLoaded, isSignedIn } = useAuth();
  if (!isLoaded) return <span aria-hidden="true" className="size-32" />;
  if (isSignedIn) {
    return <UserButton appearance={{ elements: { avatarBox: "size-32" } }} />;
  }
  return (
    <Button asChild variant="ghost" size="sm">
      <Link href="/sign-in">Sign in</Link>
    </Button>
  );
}
