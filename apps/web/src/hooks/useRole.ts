"use client";

import { useUser } from "@clerk/nextjs";
import { roleOf, type AppMetadata, type Role } from "@/lib/session";

/**
 * The signed-in user's role and setup flags from Clerk `publicMetadata`. UX only: the server
 * re-checks roles from Clerk and the chain on every request.
 */
export function useRole(): {
  isLoaded: boolean;
  isSignedIn: boolean;
  role: Role | null;
  onchainVerified: boolean;
  ineligible: boolean;
} {
  const { isLoaded, isSignedIn, user } = useUser();
  const metadata = (user?.publicMetadata ?? {}) as AppMetadata;
  return {
    isLoaded,
    isSignedIn: Boolean(isSignedIn),
    role: roleOf(metadata),
    onchainVerified: metadata.onchainVerified === true,
    ineligible: metadata.ineligible === true,
  };
}
