/**
 * Roles and Clerk metadata shared by the proxy, server helpers and client hooks.
 * Pure functions only: safe to import anywhere.
 */

export const ROLES = ["student", "arbiter", "admin"] as const;
export type Role = (typeof ROLES)[number];

/** Staff roles keep their role when they activate a student wallet. */
export const STAFF_ROLES: readonly Role[] = ["arbiter", "admin"];

/** `publicMetadata` on a Clerk user, mirrored into the session token as `metadata`. */
export interface AppMetadata {
  role?: Role;
  /** Checksummed address of the wallet verified on-chain. */
  wallet?: string;
  onchainVerified?: boolean;
  /** Set by the `user.created` webhook when the email domain isn't allowed. */
  ineligible?: boolean;
}

export function roleOf(metadata: unknown): Role | null {
  const role = (metadata as AppMetadata | null | undefined)?.role;
  return typeof role === "string" && (ROLES as readonly string[]).includes(role)
    ? (role as Role)
    : null;
}

/**
 * True when `email` belongs to one of the allowed domains: an exact, case-insensitive match of
 * the part after the last `@`. Subdomains only pass if listed themselves.
 */
export function isAllowedEmail(
  email: string | null | undefined,
  allowedDomains: readonly string[],
): boolean {
  if (!email || allowedDomains.length === 0) return false;
  const at = email.lastIndexOf("@");
  if (at <= 0 || at === email.length - 1) return false;
  const domain = email
    .slice(at + 1)
    .trim()
    .toLowerCase();
  return allowedDomains.includes(domain);
}

/** The first allowed domain, for copy like "Only @yourcollege.edu.in addresses can join." */
export function displayDomain(value: string | undefined): string | null {
  const first = value?.split(",")[0]?.trim().toLowerCase().replace(/^@/, "");
  return first || null;
}
