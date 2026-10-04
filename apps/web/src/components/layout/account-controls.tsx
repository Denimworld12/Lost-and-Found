"use client";

import { UserButton, useAuth } from "@clerk/nextjs";
import { LayoutListIcon } from "lucide-react";
import Link from "next/link";
import { BalanceChip, WalletButton } from "@/components/tx/wallet-button";
import { Button } from "@/components/ui/button";

/**
 * Header account slot. Logged out: "Sign in" Ghost pill. Signed in: the withdraw chip (when
 * something is owed), the wallet pill and the Clerk avatar menu with a link to My items.
 */
export function AccountControls() {
  const { isLoaded, isSignedIn } = useAuth();
  if (!isLoaded) return <span aria-hidden="true" className="size-32" />;
  if (isSignedIn) {
    return (
      <>
        <span className="hidden lg:contents">
          <BalanceChip />
        </span>
        <WalletButton />
        <UserButton appearance={{ elements: { avatarBox: "size-32" } }}>
          <UserButton.MenuItems>
            <UserButton.Link
              label="My items"
              labelIcon={<LayoutListIcon className="size-16" />}
              href="/me"
            />
          </UserButton.MenuItems>
        </UserButton>
      </>
    );
  }
  return (
    <Button asChild variant="ghost" size="sm">
      <Link href="/sign-in">Sign in</Link>
    </Button>
  );
}
