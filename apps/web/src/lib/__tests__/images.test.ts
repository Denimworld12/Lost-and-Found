import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { MAX_IMAGE_BYTES, processImage } from "../images";

async function photo(
  width: number,
  height: number,
  format: "jpeg" | "png" = "jpeg",
) {
  const image = sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 200, g: 80, b: 20 },
    },
  });
  const buffer =
    format === "jpeg"
      ? await image
          .jpeg({ quality: 70 })
          // EXIF orientation 6 (rotate 90°) and a GPS-like comment that must not survive.
          .withMetadata({
            orientation: 6,
            exif: { IFD0: { Copyright: "Riya, roll 21CS042" } },
          })
          .toBuffer()
      : await image.png().toBuffer();
  return new File([new Uint8Array(buffer)], `photo.${format}`, {
    type: `image/${format}`,
  });
}

describe("processImage", () => {
  it("rotates by EXIF, fits inside 1600 px and outputs WebP with no metadata", async () => {
    const output = await processImage(await photo(2400, 1200));
    const meta = await sharp(output).metadata();
    expect(meta.format).toBe("webp");
    // 2400×1200 rotated 90° is 1200×2400, then fit inside 1600: 800×1600.
    expect(meta.width).toBe(800);
    expect(meta.height).toBe(1600);
    expect(meta.exif).toBeUndefined();
    expect(meta.orientation).toBeUndefined();
    expect(output.includes(Buffer.from("21CS042"))).toBe(false);
  });

  it("doesn't enlarge small photos", async () => {
    const meta = await sharp(
      await processImage(await photo(400, 300, "png")),
    ).metadata();
    expect([meta.width, meta.height]).toEqual([400, 300]);
  });

  it("refuses files over 2 MB with 413", async () => {
    const big = new File([new Uint8Array(MAX_IMAGE_BYTES + 1)], "big.jpg", {
      type: "image/jpeg",
    });
    await expect(processImage(big)).rejects.toMatchObject({ status: 413 });
  });

  it("refuses other types, and content that doesn't match its declared type, with 415", async () => {
    const gif = new File([new Uint8Array([0x47, 0x49, 0x46])], "a.gif", {
      type: "image/gif",
    });
    await expect(processImage(gif)).rejects.toMatchObject({ status: 415 });
    const fake = new File(["<svg></svg>"], "a.png", { type: "image/png" });
    await expect(processImage(fake)).rejects.toMatchObject({
      status: 415,
      code: "UNSUPPORTED_MEDIA_TYPE",
    });
  });
});
