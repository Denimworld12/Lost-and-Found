import sharp from "sharp";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api";
import { fakeDb } from "@/test/fakes";

const requireVerifiedStudent = vi.fn();
vi.mock("@/lib/auth", () => ({
  requireVerifiedStudent: () => requireVerifiedStudent(),
}));

const pinImage = vi.fn();
const pinJson = vi.fn();
vi.mock("@/lib/pinata", () => ({
  pinImage: (...args: unknown[]) => pinImage(...args),
  pinJson: (...args: unknown[]) => pinJson(...args),
}));

let db = fakeDb();
vi.mock("@/lib/db", async (original) => ({
  ...(await original<typeof import("@/lib/db/schema")>()),
  getDb: () => db.db,
}));

const { POST } = await import("../upload/route");

const IMAGE_CID = "bafkreihtny7ve5ohrklxftqiqib3xjq254ak7ljwrvydyomnwgsh32j3xm";
const META_CID = "bafkreigh2akiscaildcqabsyg3dfr6chu3fgpregiymsck7e7aqa4s52zy";

const details = {
  title: "Casio fx-991 calculator",
  category: "Electronics",
  location: "Library, 2nd floor",
  lostOn: "2026-10-02",
};

function form(fields: Record<string, string>, image?: File) {
  const body = new FormData();
  for (const [key, value] of Object.entries(fields)) body.set(key, value);
  if (image) body.set("image", image);
  return new Request("http://localhost/api/upload", { method: "POST", body });
}

beforeEach(() => {
  vi.clearAllMocks();
  db = fakeDb([[{ recent: 0 }]]);
  requireVerifiedStudent.mockResolvedValue({ user: { id: "user_1" } });
  pinImage.mockResolvedValue(IMAGE_CID);
  pinJson.mockResolvedValue(META_CID);
});

describe("POST /api/upload", () => {
  it("is refused for anyone who isn't a verified student", async () => {
    requireVerifiedStudent.mockRejectedValue(
      new ApiError(
        403,
        "NOT_VERIFIED",
        "Finish setting up your account before you post or claim.",
      ),
    );
    const response = await POST(form(details));
    expect(response.status).toBe(403);
    expect(pinJson).not.toHaveBeenCalled();
  });

  it("pins the processed photo, then metadata pointing at it, and logs the upload", async () => {
    const png = await sharp({
      create: { width: 50, height: 40, channels: 3, background: "#ff6314" },
    })
      .png()
      .toBuffer();
    const response = await POST(
      form(
        details,
        new File([new Uint8Array(png)], "p.png", { type: "image/png" }),
      ),
    );
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({
      cid: META_CID,
      imageCid: IMAGE_CID,
    });
    const webp = pinImage.mock.calls[0][0] as Buffer;
    expect((await sharp(webp).metadata()).format).toBe("webp");
    expect(pinJson).toHaveBeenCalledWith({ ...details, image: IMAGE_CID });
    expect(db.calls.some((call) => call.method === "insert")).toBe(true);
  });

  it("works without a photo", async () => {
    const response = await POST(
      form({ ...details, description: "Black, sticker on the back" }),
    );
    expect(await response.json()).toEqual({ cid: META_CID, imageCid: null });
    expect(pinImage).not.toHaveBeenCalled();
    expect(pinJson).toHaveBeenCalledWith({
      ...details,
      description: "Black, sticker on the back",
    });
  });

  it("validates the fields with the shared schema", async () => {
    db = fakeDb([[{ recent: 0 }], [{ recent: 0 }], [{ recent: 0 }]]);
    const response = await POST(form({ ...details, title: "x".repeat(61) }));
    expect(response.status).toBe(400);
    expect((await response.json()).error.message).toMatch(/^title:/);
    const future = await POST(form({ ...details, lostOn: "2999-01-01" }));
    expect((await future.json()).error.message).toMatch(/future/);
    const category = await POST(form({ ...details, category: "Weapons" }));
    expect(category.status).toBe(400);
  });

  it("allows 5 uploads an hour", async () => {
    db = fakeDb([[{ recent: 5 }]]);
    const response = await POST(form(details));
    expect(response.status).toBe(429);
    expect((await response.json()).error.code).toBe("RATE_LIMITED");
  });

  it("refuses a declared body over the cap before reading it", async () => {
    const request = new Request("http://localhost/api/upload", {
      method: "POST",
      headers: {
        "content-length": String(5 * 1024 * 1024),
        "content-type": "multipart/form-data; boundary=x",
      },
      body: "x",
    });
    expect((await POST(request)).status).toBe(413);
  });

  it("refuses a non-image file with 415", async () => {
    const response = await POST(
      form(details, new File(["hello"], "notes.txt", { type: "text/plain" })),
    );
    expect(response.status).toBe(415);
    expect(pinJson).not.toHaveBeenCalled();
  });

  it("needs multipart form data", async () => {
    const response = await POST(
      new Request("http://localhost/api/upload", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(details),
      }),
    );
    expect(response.status).toBe(400);
  });
});
