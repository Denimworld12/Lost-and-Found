import "server-only";
import { currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { primaryVerifiedEmail } from "./clerk-user";
import { parseAllowedDomains } from "./env";
import { isAllowedEmail, roleOf, type Role } from "./session";

/**
 * Server check for admin pages, behind the proxy's session-token check: fresh Clerk data,
 * college email, and a role in `allowed`. Arbiters on an admin-only page go to Disputes.
 */
export async function requireAdminPage(
  allowed: readonly Role[] = ["admin"],
): Promise<Role> {
  const user = await currentUser();
  if (!user) redirect("/sign-in");

  const domains = parseAllowedDomains(process.env.ALLOWED_EMAIL_DOMAIN ?? "");
  if (
    domains.length > 0 &&
    !isAllowedEmail(primaryVerifiedEmail(user), domains)
  )
    redirect("/not-eligible");

  const role = roleOf(user.publicMetadata);
  if (role && allowed.includes(role)) return role;
  if (role === "arbiter") redirect("/admin/disputes");
  redirect("/");
}
