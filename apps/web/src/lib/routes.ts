import { isAllowedEmail, roleOf, type AppMetadata } from "./session";

/**
 * Route protection rules (PLAN.md → Phase 7 → Route protection), as a pure function so the
 * proxy stays thin and the rules are unit-tested. Hidden links are UX only; every API handler
 * re-checks its own rules on the server.
 */

export type RouteDecision =
  | { type: "next" }
  | { type: "sign-in" }
  | { type: "redirect"; to: string }
  | { type: "unauthorized" };

export interface RouteRequest {
  pathname: string;
  userId: string | null;
  /** Session token claims: `metadata` (public metadata) and `email` (custom claims). */
  claims: { metadata?: AppMetadata; email?: string } | null;
  /** Parsed `ALLOWED_EMAIL_DOMAIN`; empty when unset (the server helpers then answer 503). */
  allowedDomains: readonly string[];
}

const PUBLIC_PAGES = [
  /^\/$/,
  /^\/items$/,
  /^\/items\/[^/]+$/,
  /^\/how-it-works$/,
  /^\/transparency$/,
  /^\/sign-in(\/.*)?$/,
  /^\/sign-up(\/.*)?$/,
  /^\/not-eligible$/,
];

const VERIFIED_PAGES = [/^\/post(\/.*)?$/, /^\/me(\/.*)?$/];
const ADMIN_PAGES = /^\/admin(\/.*)?$/;
/** Admin sections an arbiter may open. */
const ARBITER_PAGES = [/^\/admin\/?$/, /^\/admin\/disputes(\/.*)?$/];

function matches(pathname: string, patterns: readonly RegExp[]) {
  return patterns.some((pattern) => pattern.test(pathname));
}

/** True when the token says the email is outside the college domain (or the webhook flagged it). */
function ineligible({ claims, allowedDomains }: RouteRequest): boolean {
  if (claims?.metadata?.ineligible === true) return true;
  // Without the email claim (session token not customised yet) the server pages decide.
  if (!claims?.email || allowedDomains.length === 0) return false;
  return !isAllowedEmail(claims.email, allowedDomains);
}

export function decideRoute(request: RouteRequest): RouteDecision {
  const { pathname, userId, claims } = request;

  if (pathname.startsWith("/api/")) {
    if (pathname.startsWith("/api/webhooks/")) return { type: "next" };
    return userId ? { type: "next" } : { type: "unauthorized" };
  }

  if (matches(pathname, PUBLIC_PAGES)) return { type: "next" };
  if (!userId) return { type: "sign-in" };
  if (ineligible(request)) return { type: "redirect", to: "/not-eligible" };

  if (matches(pathname, VERIFIED_PAGES)) {
    return claims?.metadata?.onchainVerified === true
      ? { type: "next" }
      : { type: "redirect", to: "/onboarding" };
  }

  if (ADMIN_PAGES.test(pathname)) {
    const role = roleOf(claims?.metadata);
    if (role === "admin") return { type: "next" };
    if (role === "arbiter") {
      return matches(pathname, ARBITER_PAGES)
        ? { type: "next" }
        : { type: "redirect", to: "/admin/disputes" };
    }
    return { type: "redirect", to: "/" };
  }

  // `/onboarding` and any other page: signed in is enough.
  return { type: "next" };
}
