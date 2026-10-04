"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { isActivePath, NAV_LINKS } from "./nav";

/** Carbon sheet from the right with every page link. `children` is the trigger. */
export function MobileMenu({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>{children}</SheetTrigger>
      <MobileMenuContent
        pathname={pathname}
        onNavigate={() => setOpen(false)}
      />
    </Sheet>
  );
}

export function MobileMenuContent({
  pathname,
  onNavigate,
}: {
  pathname: string;
  onNavigate: () => void;
}) {
  const links = [{ href: "/", label: "Home" }, ...NAV_LINKS];
  return (
    <SheetContent side="right">
      <SheetHeader>
        <SheetTitle>Menu</SheetTitle>
        <SheetDescription>
          Browse items and audit every payment.
        </SheetDescription>
      </SheetHeader>
      <nav aria-label="Menu">
        <ul className="flex flex-col">
          {links.map((link) => {
            const active =
              link.href === "/"
                ? pathname === "/"
                : isActivePath(pathname, link.href);
            return (
              <li key={link.href}>
                <Link
                  href={link.href}
                  onClick={onNavigate}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex min-h-48 items-center border-l-2 pl-12 font-clash text-body font-medium tracking-clash uppercase",
                    active
                      ? "border-signal-orange text-white"
                      : "border-transparent text-snow hover:text-white",
                  )}
                >
                  {link.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <Button asChild className="mt-auto w-full">
        <Link href="/post" onClick={onNavigate}>
          Report lost item
        </Link>
      </Button>
    </SheetContent>
  );
}
