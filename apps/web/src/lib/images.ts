import "server-only";
import sharp from "sharp";
import { ApiError } from "./api";

/** Server cap per photo; the client compresses to this before upload (Vercel's limit is ~4.5 MB). */
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
export const MAX_IMAGE_EDGE = 1600;
export const ACCEPTED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
] as const;

/** Formats sharp may report for the accepted types. */
const ACCEPTED_FORMATS = new Set(["jpeg", "png", "webp", "heif"]);
/** Refuse decompression bombs: about a 50-megapixel photo. */
const MAX_INPUT_PIXELS = 50_000_000;

/**
 * Validates and re-encodes a photo: rotate by EXIF, fit inside 1600 px, WebP quality 80. sharp
 * drops all metadata (EXIF, GPS) unless asked to keep it, so nothing personal survives.
 */
export async function processImage(file: File): Promise<Buffer> {
  if (file.size > MAX_IMAGE_BYTES) {
    throw new ApiError(413, "PAYLOAD_TOO_LARGE", "Photos can be up to 2 MB.");
  }
  if (!(ACCEPTED_IMAGE_TYPES as readonly string[]).includes(file.type)) {
    throw unsupported();
  }
  const input = Buffer.from(await file.arrayBuffer());

  let format: string | undefined;
  try {
    ({ format } = await sharp(input, {
      limitInputPixels: MAX_INPUT_PIXELS,
    }).metadata());
  } catch {
    throw unsupported();
  }
  // The declared type is only a hint; trust the decoded format.
  if (!format || !ACCEPTED_FORMATS.has(format)) throw unsupported();

  try {
    return await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS })
      .rotate()
      .resize({
        width: MAX_IMAGE_EDGE,
        height: MAX_IMAGE_EDGE,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 80 })
      .toBuffer();
  } catch {
    // Prebuilt sharp can't decode HEVC-based HEIC (iPhone photos). Browsers that can show
    // them re-encode on the client; anything that still arrives as HEIC gets this message.
    throw unsupported();
  }
}

function unsupported() {
  return new ApiError(
    415,
    "UNSUPPORTED_MEDIA_TYPE",
    "Use a JPEG, PNG or WebP photo. If it's an iPhone HEIC photo, export it as JPEG first.",
  );
}
