/** A 0x-prefixed hex address (same shape as viem's `Address`, without the dependency). */
export type Address = `0x${string}`;

/**
 * Item status names in the order of the contract's `Status` enum.
 * Index 0 (`None`) never appears on an existing item.
 */
export const ITEM_STATUSES = [
  "None",
  "Open",
  "Claimed",
  "Disputed",
  "Completed",
  "Cancelled",
] as const;

export type ItemStatusName = (typeof ITEM_STATUSES)[number];

/** Statuses an existing item can have. */
export type ItemStatus = Exclude<ItemStatusName, "None">;

/** One item as stored on-chain, with wei amounts and timestamps (seconds) as bigint. */
export interface Item {
  id: bigint;
  owner: Address;
  status: ItemStatus;
  /** Block timestamp of `postItem`, in seconds. */
  createdAt: bigint;
  /** `null` until someone claims the item. */
  finder: Address | null;
  /** Block timestamp of `claimItem`, in seconds; `null` until claimed. */
  claimedAt: bigint | null;
  /** Confirm window locked at claim time, in seconds; 0 until claimed. */
  claimWindow: bigint;
  reward: bigint;
  /** Deposit the finder locked at claim time; 0 until claimed. */
  stake: bigint;
  metadataCID: string;
}
