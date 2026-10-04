import type { AppMetadata } from "@/lib/session";

declare global {
  // Typed Clerk publicMetadata (see src/lib/session.ts).
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface UserPublicMetadata extends AppMetadata {}

  /**
   * Custom session token claims (Clerk Dashboard → Sessions → Customize session token):
   * `{ "metadata": "{{user.public_metadata}}", "email": "{{user.primary_email_address}}" }`
   */
  interface CustomJwtSessionClaims {
    metadata?: AppMetadata;
    email?: string;
  }
}

export {};
