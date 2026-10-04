"use client";

import { useAuth } from "@clerk/nextjs";
import { MenuIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AccountControls } from "./account-controls";
import { Logo } from "./logo";
import { MobileMenu } from "./mobile-menu";
import { NeedsBadge, useNeedsCount } from "./needs-badge";
import { isActivePath, NAV_LINKS } from "./nav";

/** Sticky 60px Obsidian nav. Under 768px: logo + menu button; the bottom nav takes the links. */
export function SiteHeader() {
  const pathname = usePathname();
  const { isSignedIn } = useAuth();
  const needs = useNeedsCount();
  const links = isSignedIn
    ? [...NAV_LINKS, { href: "/me", label: "My items" } as const]
    : NAV_LINKS;
  return (
    <header className="sticky top-0 z-40 border-b border-charcoal bg-obsidian">
      <div className="page-x flex h-60 items-center gap-24">
        <Logo compact />
        <nav aria-label="Main" className="hidden flex-1 md:block">
          <ul className="flex items-center gap-28">
            {links.map((link) => {
              const active = isActivePath(pathname, link.href);
              return (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "inline-flex h-60 items-center border-b-2 font-clash text-body-sm font-medium tracking-clash uppercase transition-colors",
                      active
                        ? "border-signal-orange text-white"
                        : "border-transparent text-snow hover:text-white",
                    )}
                  >
                    {link.label}
                    {link.href === "/me" && (
                      <NeedsBadge count={needs} className="ml-7" />
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        <div className="ml-auto flex items-center gap-12">
          <AccountControls />
          <Button asChild className="hidden md:inline-flex">
            <Link href="/post">Report lost item</Link>
          </Button>
          <MobileMenu>
            <Button
              variant="quiet"
              size="icon"
              className="md:hidden"
              aria-label="Open menu"
            >
              <MenuIcon aria-hidden="true" className="size-24" />
            </Button>
          </MobileMenu>
        </div>
      </div>
    </header>
  );
}
