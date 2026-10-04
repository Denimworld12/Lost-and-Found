/** Ethereum Sepolia testnet chain ID. */
export const SEPOLIA_CHAIN_ID = 11155111;

/** Local Hardhat node chain ID. */
export const HARDHAT_CHAIN_ID = 31337;

/** Item categories, in the order the post form and browse filters list them. */
export const CATEGORIES = [
  "Electronics",
  "ID & cards",
  "Keys",
  "Bags",
  "Books & notes",
  "Clothing",
  "Bottles",
  "Other",
] as const;

export type Category = (typeof CATEGORIES)[number];
