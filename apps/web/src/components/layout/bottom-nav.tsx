"use client";

import { EllipsisIcon, PlusIcon, SearchIcon, UserIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Sheet, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { MobileMenuContent } from "./mobile-menu";
import { isActivePath } from "./nav";

const itemClass =
  "flex min-h-56 flex-1 cursor-pointer flex-col items-center justify-center gap-4 border-t-2 font-mono text-caption uppercase [&_svg]:size-20";

function NavItem({
  href,
  label,
  icon,
  pathname,
}: {
  href: string;
  label: string;
  icon: ReactNode;
  pathname: string;
}) {
  const active = isActivePath(pathname, href);
  return (
    <li className="flex flex-1">
      <Link
        href={href}
        aria-current={active ? "page" : undefined}
        className={cn(
          itemClass,
          active
            ? "border-signal-orange text-white"
            : "border-transparent text-snow",
        )}
      >
        {icon}
        {label}
      </Link>
    </li>
  );
}

/** Mobile bottom nav (under 768px): Browse · Report · Me · More, above the safe area. */
export function BottomNav() {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <nav
      aria-label="Quick links"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-charcoal bg-obsidian pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <ul className="flex">
        <NavItem
          href="/items"
          label="Browse"
          icon={<SearchIcon aria-hidden="true" />}
          pathname={pathname}
        />
        <NavItem
          href="/post"
          label="Report"
          icon={<PlusIcon aria-hidden="true" className="text-signal-orange" />}
          pathname={pathname}
        />
        <NavItem
          href="/me"
          label="Me"
          icon={<UserIcon aria-hidden="true" />}
          pathname={pathname}
        />
        <li className="flex flex-1">
          <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
            <SheetTrigger
              className={cn(itemClass, "border-transparent text-snow")}
            >
              <EllipsisIcon aria-hidden="true" />
              More
            </SheetTrigger>
            <MobileMenuContent
              pathname={pathname}
              onNavigate={() => setMenuOpen(false)}
            />
          </Sheet>
        </li>
      </ul>
    </nav>
  );
}
