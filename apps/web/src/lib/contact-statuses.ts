import type { ItemStatus } from "@milgaya/shared";

/** Statuses in which the owner and finder may see each other's college email. */
export const CONTACT_STATUSES: readonly ItemStatus[] = [
  "Claimed",
  "Disputed",
  "Completed",
];
