import { ApiError } from "./api";

/**
 * Server-only configuration, read lazily so a missing value fails the one request that needs
 * it (with a typed 503) instead of the whole build. Values are never echoed back.
 */
function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new ApiError(
      503,
      "NOT_CONFIGURED",
      "This feature isn't set up on the server yet. Try again later.",
      `${name} is not set`,
    );
  }
  return value;
}

export const serverEnv = {
  databaseUrl: () => required("DATABASE_URL"),
  verifierPrivateKey: () => required("VERIFIER_PRIVATE_KEY"),
  pinataJwt: () => required("PINATA_JWT"),
  /** Comma-separated college domains, lowercase, e.g. `yourcollege.edu.in`. */
  allowedEmailDomains: () =>
    parseAllowedDomains(required("ALLOWED_EMAIL_DOMAIN")),
};

/**
 * `ALLOWED_EMAIL_DOMAIN` may list several domains separated by commas. Subdomains are not
 * implied: `cs.yourcollege.edu.in` is allowed only if it is listed itself.
 */
export function parseAllowedDomains(value: string): string[] {
  return value
    .split(",")
    .map((domain) => domain.trim().toLowerCase().replace(/^@/, ""))
    .filter(Boolean);
}
