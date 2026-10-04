/**
 * Client-side photo compression before upload: the server caps photos at 2 MB and Vercel
 * bodies at about 4.5 MB. Re-encoding also drops EXIF (location, device) before the photo
 * leaves the phone, and turns iPhone HEIC into JPEG where the browser can decode it.
 */

export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;
/** Same as the server's resize; nothing larger is ever stored. */
export const MAX_EDGE = 1600;
const QUALITIES = [0.85, 0.75, 0.65, 0.5];

export class PhotoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PhotoError";
  }
}

/** Width and height that fit inside `maxEdge`, keeping the aspect ratio. */
export function fitWithin(
  width: number,
  height: number,
  maxEdge = MAX_EDGE,
): { width: number; height: number } {
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function toBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number,
): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

/**
 * Decodes the photo (honouring EXIF rotation), fits it inside 1600 px and encodes JPEG,
 * lowering quality until it is under 2 MB. Throws `PhotoError` with copy to show.
 */
export async function compressPhoto(file: File): Promise<File> {
  if (!file.type.startsWith("image/") && !/\.(heic|heif)$/i.test(file.name)) {
    throw new PhotoError("Choose a photo (JPEG, PNG, WebP or HEIC).");
  }
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new PhotoError(
      "This browser can't read that photo. Use a JPEG or PNG, or take a screenshot of it.",
    );
  }
  const { width, height } = fitWithin(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new PhotoError("This browser can't process photos.");
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  for (const quality of QUALITIES) {
    const blob = await toBlob(canvas, "image/jpeg", quality);
    if (blob && blob.size <= MAX_UPLOAD_BYTES) {
      const name = file.name.replace(/\.[^.]*$/, "") || "photo";
      return new File([blob], `${name}.jpg`, { type: "image/jpeg" });
    }
  }
  throw new PhotoError(
    "That photo is too large even after compressing. Try another.",
  );
}
