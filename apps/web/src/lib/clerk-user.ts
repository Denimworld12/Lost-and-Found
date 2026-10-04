import { getAddress, isAddress, type Address } from "viem";

/**
 * The parts of a Clerk user (backend `User` or webhook-derived) the app relies on. Kept
 * structural so the logic is testable without Clerk.
 */
export interface ClerkUserLike {
  id: string;
  primaryEmailAddressId: string | null;
  emailAddresses: readonly {
    id: string;
    emailAddress: string;
    verification: { status: string } | null;
  }[];
  web3Wallets: readonly {
    web3Wallet: string;
    verification: { status: string } | null;
  }[];
  publicMetadata: unknown;
}

/** The primary email address, lowercase, only if Clerk has verified it. */
export function primaryVerifiedEmail(user: ClerkUserLike): string | null {
  const primary = user.emailAddresses.find(
    (email) => email.id === user.primaryEmailAddressId,
  );
  if (!primary || primary.verification?.status !== "verified") return null;
  return primary.emailAddress.trim().toLowerCase();
}

/** Every Ethereum wallet whose signature Clerk has verified, checksummed. */
export function verifiedWallets(user: ClerkUserLike): Address[] {
  return user.web3Wallets
    .filter(
      (wallet) =>
        wallet.verification?.status === "verified" &&
        isAddress(wallet.web3Wallet, { strict: false }),
    )
    .map((wallet) => getAddress(wallet.web3Wallet));
}

/**
 * The single verified wallet linked to the account, checksummed. `null` when there is none or
 * more than one (the student must remove the extra one; we never guess which wallet to whitelist).
 */
export function getLinkedWallet(user: ClerkUserLike): Address | null {
  const wallets = verifiedWallets(user);
  return wallets.length === 1 ? wallets[0] : null;
}

/** The webhook payload shape (`UserJSON`, snake_case) the app reads. */
export interface ClerkUserJsonLike {
  id: string;
  primary_email_address_id: string | null;
  email_addresses: readonly {
    id: string;
    email_address: string;
    verification: { status: string } | null;
  }[];
  web3_wallets: readonly {
    web3_wallet: string;
    verification: { status: string } | null;
  }[];
  public_metadata: unknown;
}

/** Maps a webhook `UserJSON` payload to the same shape as the backend `User`. */
export function fromUserJson(data: ClerkUserJsonLike): ClerkUserLike {
  return {
    id: data.id,
    primaryEmailAddressId: data.primary_email_address_id,
    emailAddresses: (data.email_addresses ?? []).map((email) => ({
      id: email.id,
      emailAddress: email.email_address,
      verification: email.verification,
    })),
    web3Wallets: (data.web3_wallets ?? []).map((wallet) => ({
      web3Wallet: wallet.web3_wallet,
      verification: wallet.verification,
    })),
    publicMetadata: data.public_metadata ?? {},
  };
}
