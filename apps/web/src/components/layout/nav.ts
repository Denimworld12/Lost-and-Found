import type { Role } from "@/lib/session";

/** Primary navigation, shared by the header, mobile menu and footer. */
export const NAV_LINKS = [
  { href: "/items", label: "Browse" },
  { href: "/how-it-works", label: "How it works" },
  { href: "/transparency", label: "Transparency" },
] as const;

/** Shown to admins and arbiters only. UX only: the proxy and every admin API re-check the role. */
export const ADMIN_LINK = { href: "/admin", label: "Admin" } as const;

export function isStaff(role: Role | null): boolean {
  return role === "admin" || role === "arbiter";
}

export function isActivePath(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
