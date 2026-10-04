import type { Item } from "@milgaya/shared";
import { isAddressEqual, type Address } from "viem";
import { ApiError } from "./api";
import { CONTACT_STATUSES } from "./contact-statuses";

export { CONTACT_STATUSES };

/**
 * The address whose contact `viewer` may see on `item`: the finder for the owner, the owner
 * for the finder. Throws a 403 for anyone else or in any other status.
 */
export function contactCounterparty(item: Item, viewer: Address): Address {
  if (!CONTACT_STATUSES.includes(item.status) || !item.finder) {
    throw new ApiError(
      403,
      "FORBIDDEN",
      "Contact details are shared only after an item is claimed.",
    );
  }
  if (isAddressEqual(viewer, item.owner)) return item.finder;
  if (isAddressEqual(viewer, item.finder)) return item.owner;
  throw new ApiError(
    403,
    "FORBIDDEN",
    "Only the owner and the finder of this item can see contact details.",
  );
}
