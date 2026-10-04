import { eq } from "drizzle-orm";
import { isAddressEqual } from "viem";
import { z } from "zod";
import { ApiError, handler, json, parseParams } from "@/lib/api";
import { requireVerifiedStudent } from "@/lib/auth";
import { contactCounterparty } from "@/lib/contact";
import { readItems } from "@/lib/contract";
import { contactReveals, getDb, students } from "@/lib/db";

export const dynamic = "force-dynamic";

const paramsSchema = z.object({
  id: z
    .string()
    .regex(/^[1-9]\d{0,77}$/, "Item IDs are positive whole numbers.")
    .transform((value) => BigInt(value)),
});

/**
 * The other party's college email for the caller's own claimed, disputed or returned item.
 * Every reveal is logged in `contact_reveals`.
 */
export const GET = handler(
  async (
    _request: Request,
    context: RouteContext<"/api/items/[id]/contact">,
  ) => {
    const { user, wallet } = await requireVerifiedStudent();
    const { id } = await parseParams(context.params, paramsSchema);

    const [item] = await readItems([id]);
    if (!item)
      throw new ApiError(404, "NOT_FOUND", "We couldn't find that item.");

    const other = contactCounterparty(item, wallet);
    const [contact] = await getDb()
      .select({ email: students.email })
      .from(students)
      .where(eq(students.walletAddress, other.toLowerCase()))
      .limit(1);
    if (!contact) {
      throw new ApiError(
        404,
        "NOT_FOUND",
        "The other student's contact details aren't available.",
      );
    }

    await getDb()
      .insert(contactReveals)
      .values({ itemId: id, viewerClerkId: user.id });
    return json(
      {
        email: contact.email,
        /** Whose email this is. */
        party: isAddressEqual(other, item.owner) ? "owner" : "finder",
        address: other,
      },
      { headers: { "cache-control": "private, no-store" } },
    );
  },
);
