import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clerkMocks,
  clerkServerModule,
  clerkUser,
  fakeDb,
  jsonRequest,
  params,
  signIn,
  WALLET,
} from "@/test/fakes";

vi.mock("@clerk/nextjs/server", () => clerkServerModule());

const getStudent = vi.fn();
const activateStudent = vi.fn();
const revokeStudent = vi.fn();
vi.mock("@/lib/students", () => ({
  getStudent: (...args: unknown[]) => getStudent(...args),
  activateStudent: (...args: unknown[]) => activateStudent(...args),
  revokeStudent: (...args: unknown[]) => revokeStudent(...args),
}));

let db = fakeDb();
vi.mock("@/lib/db", async (original) => ({
  ...(await original<typeof import("@/lib/db/schema")>()),
  getDb: () => db.db,
}));

const { GET: list } = await import("../admin/students/route");
const { POST: revoke } = await import("../admin/students/[id]/revoke/route");
const { POST: retry } = await import("../admin/students/[id]/retry/route");

const admin = clerkUser({
  id: "user_admin",
  publicMetadata: { role: "admin" },
});
const row = {
  clerkUserId: "user_1",
  walletAddress: WALLET.toLowerCase(),
  status: "failed",
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("ALLOWED_EMAIL_DOMAIN", "college.edu.in");
  db = fakeDb();
  signIn(admin);
  getStudent.mockResolvedValue(row);
});

describe("admin routes: access", () => {
  it.each([
    ["student", { role: "student" }],
    ["arbiter", { role: "arbiter" }],
    ["no role", {}],
  ])("refuse a %s with 403", async (_label, publicMetadata) => {
    signIn(clerkUser({ publicMetadata }));
    expect(
      (await list(new Request("http://localhost/api/admin/students"))).status,
    ).toBe(403);
    expect(
      (
        await revoke(
          jsonRequest("/api/admin/students/user_1/revoke", {}),
          params({ id: "user_1" }) as never,
        )
      ).status,
    ).toBe(403);
    expect(revokeStudent).not.toHaveBeenCalled();
  });

  it("refuse a signed-out caller with 401", async () => {
    signIn(null);
    expect(
      (await list(new Request("http://localhost/api/admin/students"))).status,
    ).toBe(401);
  });

  it("don't trust a role claimed in the request", async () => {
    signIn(clerkUser({ publicMetadata: { role: "student" } }));
    const response = await revoke(
      jsonRequest("/api/admin/students/user_1/revoke", { role: "admin" }),
      params({ id: "user_1" }) as never,
    );
    expect(response.status).toBe(403);
  });
});

describe("GET /api/admin/students", () => {
  it("paginates and returns the total", async () => {
    db = fakeDb([[row], [{ total: 31 }]]);
    const response = await list(
      new Request(
        "http://localhost/api/admin/students?q=riya&page=2&pageSize=10",
      ),
    );
    expect(await response.json()).toEqual({
      students: [row],
      page: 2,
      pageSize: 10,
      total: 31,
    });
    const offset = db.calls.find((c) => c.method === "offset");
    expect(offset?.args).toEqual([10]);
  });

  it("validates query parameters", async () => {
    const response = await list(
      new Request("http://localhost/api/admin/students?pageSize=1000"),
    );
    expect(response.status).toBe(400);
    const status = await list(
      new Request("http://localhost/api/admin/students?status=banned"),
    );
    expect(status.status).toBe(400);
  });
});

describe("POST /api/admin/students/[id]/revoke", () => {
  it("revokes and returns the tx hash", async () => {
    revokeStudent.mockResolvedValue({ txHash: `0x${"3".repeat(64)}` });
    const response = await revoke(
      jsonRequest("/api/admin/students/user_1/revoke", { note: "Graduated" }),
      params({ id: "user_1" }) as never,
    );
    expect(response.status).toBe(200);
    expect(revokeStudent).toHaveBeenCalledWith({
      student: row,
      actorClerkId: "user_admin",
      note: "Graduated",
    });
  });

  it("validates the ID and 404s unknown students", async () => {
    const bad = await revoke(
      jsonRequest("/x", {}),
      params({ id: "1; drop table" }) as never,
    );
    expect(bad.status).toBe(400);
    getStudent.mockResolvedValue(null);
    const missing = await revoke(
      jsonRequest("/x", {}),
      params({ id: "user_9" }) as never,
    );
    expect(missing.status).toBe(404);
  });
});

describe("POST /api/admin/students/[id]/retry", () => {
  it("re-runs activation with the student's current Clerk data and logs it", async () => {
    clerkMocks.getUser.mockResolvedValue(clerkUser());
    activateStudent.mockResolvedValue({
      status: "verified",
      wallet: WALLET,
      txHash: null,
    });
    const response = await retry(
      jsonRequest("/x", {}),
      params({ id: "user_1" }) as never,
    );
    expect(response.status).toBe(200);
    expect(activateStudent).toHaveBeenCalledWith(
      expect.objectContaining({ clerkUserId: "user_1", wallet: WALLET }),
    );
    expect(db.calls.some((c) => c.method === "insert")).toBe(true);
  });

  it("only retries failed or pending rows", async () => {
    getStudent.mockResolvedValue({ ...row, status: "verified" });
    const response = await retry(
      jsonRequest("/x", {}),
      params({ id: "user_1" }) as never,
    );
    expect(response.status).toBe(409);
  });

  it("refuses when the student no longer has a single linked wallet", async () => {
    clerkMocks.getUser.mockResolvedValue(clerkUser({ wallets: [] }));
    const response = await retry(
      jsonRequest("/x", {}),
      params({ id: "user_1" }) as never,
    );
    expect((await response.json()).error.code).toBe("WALLET_NOT_LINKED");
  });
});
