import { z } from "zod";

/** `[id]` in admin student routes: a Clerk user ID. */
export const studentParamsSchema = z.object({
  id: z.string().regex(/^user_[A-Za-z0-9]{1,64}$/, "Not a Clerk user ID."),
});

/** Body of admin student actions. */
export const adminActionSchema = z
  .object({ note: z.string().trim().max(500).optional() })
  .strict();
