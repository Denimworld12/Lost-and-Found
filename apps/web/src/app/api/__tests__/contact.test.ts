import { beforeEach, describe, expect, it, vi } from "vitest";
import { getAddress } from "viem";
import { fakeDb, params, WALLET } from "@/test/fakes";

const FINDER = getAddress("0x3ba2113c559f36040366477d26e286ffae8928a1");

const requireVerifiedStudent = vi.fn();
vi.mock("@/lib/auth", () => ({
  requireVerifiedStudent: () => requireVerifiedStudent(),
}));

const readItems = vi.fn();
vi.mock("@/lib/contract", () => ({
  readItems: (...args: unknown[]) => readItems(...args),
}));

let db = fakeDb();
vi.mock("@/lib/db", async (original) => ({
  ...(await original<typeof import("@/lib/db/schema")>()),
  getDb: () => db.db,
}));

const { GET } = await import("../items/[id]/contact/route");

const item = (status: string) => ({
  id: 7n,
  owner: WALLET,
  finder: FINDER,
  status,
});

const call = (id: string) =>
  GET(
    new Request(`http://localhost/api/items/${id}/contact`),
    params({ id }) as never,
  );

beforeEach(() => {
  vi.clearAllMocks();
  db = fakeDb([[{ email: "arjun@college.edu.in" }], undefined]);
  requireVerifiedStudent.mockResolvedValue({
    user: { id: "user_owner" },
    wallet: WALLET,
  });
  readItems.mockResolvedValue([item("Claimed")]);
});

describe("GET /api/items/[id]/contact", () => {
  it("gives the owner the finder's college email and logs the reveal", async () => {
    const response = await call("7");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      email: "arjun@college.edu.in",
      party: "finder",
      address: FINDER,
    });
    expect(readItems).toHaveBeenCalledWith([7n]);
    expect(db.calls.filter((c) => c.method === "insert")).toHaveLength(1);
    expect(response.headers.get("cache-control")).toContain("no-store");
  });

  it("refuses open items and outsiders", async () => {
    readItems.mockResolvedValue([item("Open")]);
    expect((await call("7")).status).toBe(403);
    readItems.mockResolvedValue([item("Claimed")]);
    requireVerifiedStudent.mockResolvedValue({
      user: { id: "user_x" },
      wallet: getAddress("0x9ff4cd7d8daf39334b469d7c009e5bc4830b6947"),
    });
    expect((await call("7")).status).toBe(403);
    expect(db.calls.some((c) => c.method === "insert")).toBe(false);
  });

  it("validates the item ID and 404s unknown items", async () => {
    expect((await call("abc")).status).toBe(400);
    expect((await call("0")).status).toBe(400);
    readItems.mockResolvedValue([]);
    expect((await call("99")).status).toBe(404);
  });
});
