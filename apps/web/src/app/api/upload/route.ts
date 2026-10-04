import { and, count, eq, gt, sql } from "drizzle-orm";
import { ApiError, handler, json, parse } from "@/lib/api";
import { requireVerifiedStudent } from "@/lib/auth";
import { getDb, uploads } from "@/lib/db";
import { MAX_IMAGE_BYTES, processImage } from "@/lib/images";
import { itemDetailsSchema, type ItemMetadata } from "@/lib/ipfs";
import { pinImage, pinJson } from "@/lib/pinata";

export const dynamic = "force-dynamic";

const UPLOADS_PER_HOUR = 5;
/** Photo cap plus room for the text fields and multipart framing. */
const MAX_BODY_BYTES = MAX_IMAGE_BYTES + 64 * 1024;

/**
 * Multipart form: `title`, `category`, `location`, `lostOn`, optional `description` and
 * optional `image`. Pins the processed photo, then the metadata JSON that goes on-chain.
 * Returns `{ cid, imageCid }`.
 */
export const POST = handler(async (request: Request) => {
  const { user } = await requireVerifiedStudent();

  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_BODY_BYTES) {
    throw new ApiError(413, "PAYLOAD_TOO_LARGE", "Photos can be up to 2 MB.");
  }
  if (!request.headers.get("content-type")?.startsWith("multipart/form-data")) {
    throw new ApiError(
      400,
      "BAD_REQUEST",
      "Send the item as multipart form data.",
    );
  }

  const db = getDb();
  const uploadId = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${user.id}))`);
    const [{ recent }] = await tx
      .select({ recent: count() })
      .from(uploads)
      .where(
        and(
          eq(uploads.clerkUserId, user.id),
          gt(uploads.createdAt, new Date(Date.now() - 60 * 60 * 1000)),
        ),
      );
    if (recent >= UPLOADS_PER_HOUR) {
      throw new ApiError(
        429,
        "RATE_LIMITED",
        `You can upload ${UPLOADS_PER_HOUR} items an hour. Try again later.`,
      );
    }
    const [{ id }] = await tx
      .insert(uploads)
      .values({ clerkUserId: user.id, cid: "", bytes: 0 })
      .returning({ id: uploads.id });
    return id;
  });

  try {
    const result = await pinItem(request);
    await db
      .update(uploads)
      .set({ cid: result.cid, bytes: result.bytes })
      .where(eq(uploads.id, uploadId));
    return json(
      { cid: result.cid, imageCid: result.imageCid },
      { status: 201 },
    );
  } catch (error) {
    await db.delete(uploads).where(eq(uploads.id, uploadId));
    throw error;
  }
});

/** Reads and validates the form, then pins the photo and the metadata JSON. */
async function pinItem(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    throw new ApiError(400, "BAD_REQUEST", "The form data couldn't be read.");
  }

  const text = (name: string) => {
    const value = form.get(name);
    return typeof value === "string" && value.trim() !== "" ? value : undefined;
  };
  const details = parse(itemDetailsSchema, {
    title: text("title"),
    category: text("category"),
    location: text("location"),
    lostOn: text("lostOn"),
    description: text("description"),
  });

  const image = form.get("image");
  if (image !== null && !(image instanceof File)) {
    throw new ApiError(400, "BAD_REQUEST", "image: expected a file.");
  }

  let imageCid: string | null = null;
  let bytes = 0;
  if (image && image.size > 0) {
    const webp = await processImage(image);
    imageCid = await pinImage(webp);
    bytes += webp.byteLength;
  }

  const metadata: ItemMetadata = {
    ...details,
    ...(imageCid ? { image: imageCid } : {}),
  };
  const cid = await pinJson(metadata);
  bytes += new TextEncoder().encode(JSON.stringify(metadata)).byteLength;

  return { cid, imageCid, bytes };
}
