/** Primary navigation, shared by the header, mobile menu and footer. */
export const NAV_LINKS = [
  { href: "/items", label: "Browse" },
  { href: "/how-it-works", label: "How it works" },
  { href: "/transparency", label: "Transparency" },
] as const;

export function isActivePath(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
