"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, type ReactNode } from "react";
import { NodeDot } from "@/components/item/node-dot";
import { useContractConfig } from "@/hooks/useChainData";
import type { Role } from "@/lib/session";
import { cn } from "@/lib/utils";

export const ADMIN_TABS = [
  { href: "/admin", label: "Overview", arbiter: false },
  { href: "/admin/students", label: "Students", arbiter: false },
  { href: "/admin/disputes", label: "Disputes", arbiter: true },
  { href: "/admin/settings", label: "Settings", arbiter: false },
  { href: "/admin/audit", label: "Audit log", arbiter: false },
] as const;

/** Tabs a role may open: arbiters see Disputes only (docs/UI_SPEC.md → Admin). */
export function adminTabs(role: Role) {
  return ADMIN_TABS.filter((tab) => role === "admin" || tab.arbiter);
}

/**
 * The admin console frame: left tabs on desktop, top tabs on phones, and a banner across the
 * whole area while posting and claiming are paused.
 */
export function AdminShell({
  role,
  children,
}: {
  role: Role;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const config = useContractConfig();
  const tabs = adminTabs(role);
  const listRef = useRef<HTMLUListElement>(null);

  // Phones: the tabs scroll sideways; bring the current one into view.
  useEffect(() => {
    const list = listRef.current;
    const active = list?.querySelector<HTMLElement>('[aria-current="page"]');
    if (list && active && list.scrollWidth > list.clientWidth)
      list.scrollLeft = active.offsetLeft - list.offsetLeft - 16;
  }, [pathname]);

  return (
    <div className="flex flex-col gap-24">
      <div className="flex flex-col gap-9">
        <h1 className="text-heading-sm md:text-heading">Admin console</h1>
        <p className="font-mono text-caption text-cloud uppercase">
          Signed in as {role === "admin" ? "admin" : "arbiter"}
        </p>
      </div>

      {config.data?.paused && (
        <div
          role="status"
          className="flex flex-col gap-9 rounded-card border border-node-magenta bg-carbon px-24 py-16 sm:flex-row sm:items-center sm:justify-between"
        >
          <p className="flex items-start gap-9 text-body-sm text-snow">
            <NodeDot tone="magenta" className="mt-5" />
            <span>
              Posting and claiming are paused. Students can&apos;t post or claim
              until an admin resumes.
            </span>
          </p>
          {role === "admin" && pathname !== "/admin/settings" && (
            <Link
              href="/admin/settings"
              className="font-clash text-body-sm font-medium tracking-clash whitespace-nowrap text-snow uppercase underline-offset-4 hover:underline"
            >
              Go to settings
            </Link>
          )}
        </div>
      )}

      <div className="flex flex-col gap-24 md:grid md:grid-cols-[200px_minmax(0,1fr)] md:gap-48">
        <nav aria-label="Admin">
          <ul
            ref={listRef}
            className="flex [scrollbar-width:none] gap-24 overflow-x-auto border-b border-charcoal md:flex-col md:gap-4 md:border-b-0 md:border-l"
          >
            {tabs.map((tab) => {
              const active = pathname === tab.href;
              return (
                <li key={tab.href}>
                  <Link
                    href={tab.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "-mb-px inline-flex min-h-44 items-center border-b-2 font-clash text-body-sm font-medium tracking-clash whitespace-nowrap uppercase transition-colors",
                      "md:mb-0 md:-ml-px md:w-full md:border-b-0 md:border-l-2 md:pl-16",
                      active
                        ? "border-signal-orange text-white"
                        : "border-transparent text-snow hover:text-white",
                    )}
                  >
                    {tab.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
