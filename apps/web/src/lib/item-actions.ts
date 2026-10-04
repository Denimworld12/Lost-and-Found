import type { Item } from "@clf/shared";
import { isAddressEqual, type Address } from "viem";

/** Who is looking at the item page, from the ActionBar matrix in docs/UI_SPEC.md. */
export type ViewerRole =
  | "owner"
  | "finder"
  /** Signed in, activated, neither owner nor finder. */
  | "student"
  /** Signed in but setup isn't finished. */
  | "unverified"
  | "guest";

export type ItemAction =
  | "claim"
  | "cancel"
  | "confirm"
  | "reject"
  | "dispute"
  | "collect"
  | "withdraw";

export type ActionNote =
  | "sign-in"
  | "finish-setup"
  | "claimed"
  | "awaiting-arbiter"
  | "disputed"
  | "cancelled";

export interface ActionPlan {
  /** Buttons in display order; the first is the Primary one. */
  actions: ItemAction[];
  note: ActionNote | null;
}

export function viewerRole(
  item: Pick<Item, "owner" | "finder">,
  viewer: {
    signedIn: boolean;
    /** Wallet linked to the account and whitelisted on-chain, else `null`. */
    verifiedWallet: Address | null;
    /** Wallet linked to the account (verified or not). */
    linkedWallet: Address | null;
  },
): ViewerRole {
  if (!viewer.signedIn) return "guest";
  const wallet = viewer.linkedWallet;
  // Owner and finder keep their actions even if access is later revoked: existing items still finish.
  if (wallet && isAddressEqual(wallet, item.owner)) return "owner";
  if (wallet && item.finder && isAddressEqual(wallet, item.finder))
    return "finder";
  return viewer.verifiedWallet ? "student" : "unverified";
}

/**
 * `block.timestamp <= claimedAt + claimWindow`, measured with chain time. `null` (chain time
 * not loaded yet) counts as inside the window; the contract has the final say.
 */
export function withinWindow(
  item: Pick<Item, "claimedAt" | "claimWindow">,
  chainNow: bigint | null,
): boolean {
  if (item.claimedAt === null || chainNow === null) return true;
  return chainNow <= item.claimedAt + item.claimWindow;
}

/** The ActionBar matrix (viewer × status) from docs/UI_SPEC.md → Item detail. */
export function planItemActions(
  item: Pick<Item, "status" | "claimedAt" | "claimWindow">,
  role: ViewerRole,
  chainNow: bigint | null,
  withdrawable: bigint,
): ActionPlan {
  const outsider =
    role === "student" || role === "unverified" || role === "guest";
  const withdraw: ItemAction[] =
    withdrawable > 0n && (role === "owner" || role === "finder")
      ? ["withdraw"]
      : [];

  switch (item.status) {
    case "Open":
      if (role === "owner") return { actions: ["cancel"], note: null };
      if (role === "student") return { actions: ["claim"], note: null };
      if (role === "guest") return { actions: [], note: "sign-in" };
      if (role === "unverified") return { actions: [], note: "finish-setup" };
      return { actions: [], note: null };
    case "Claimed": {
      const open = withinWindow(item, chainNow);
      if (role === "owner")
        return {
          actions: open ? ["confirm", "reject", "dispute"] : ["confirm"],
          note: null,
        };
      if (role === "finder")
        return { actions: open ? ["dispute"] : ["collect"], note: null };
      return { actions: [], note: outsider ? "claimed" : null };
    }
    case "Disputed":
      if (role === "owner" || role === "finder")
        return { actions: [], note: "awaiting-arbiter" };
      return { actions: [], note: "disputed" };
    case "Completed":
      return { actions: withdraw, note: null };
    case "Cancelled":
      if (role === "owner") return { actions: withdraw, note: null };
      return { actions: [], note: "cancelled" };
  }
}
