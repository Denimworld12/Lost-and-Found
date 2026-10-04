import { getAddress } from "viem";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api";
import {
  clerkServerModule,
  clerkUser,
  fakeDb,
  jsonRequest,
  signIn,
} from "@/test/fakes";

vi.mock("@clerk/nextjs/server", () => clerkServerModule());

const verifyAdminTx = vi.fn();
const listDisputes = vi.fn();
const actorEmails = vi.fn();
vi.mock("@/lib/admin-server", () => ({
  verifyAdminTx: (...args: unknown[]) => verifyAdminTx(...args),
  listDisputes: (...args: unknown[]) => listDisputes(...args),
  actorEmails: (...args: unknown[]) => actorEmails(...args),
}));

const VERIFIER = getAddress("0x45933417B883B3ecb5eDB185c2a73823F3313016");
vi.mock("@/lib/verifier", () => ({ verifierAddress: () => VERIFIER }));

const getBalance = vi.fn();
vi.mock("@/lib/contract", async (original) => ({
  ...(await original<typeof import("@/lib/contract")>()),
  getPublicClient: () => ({ getBalance }),
}));

let db = fakeDb();
vi.mock("@/lib/db", async (original) => ({
  ...(await original<typeof import("@/lib/db/schema")>()),
  getDb: () => db.db,
}));

const actions = await import("../admin/actions/route");
const disputes = await import("../admin/disputes/route");
const overview = await import("../admin/overview/route");

const ARBITER_WALLET = getAddress("0x9FF4CD7D8DaF39334b469D7C009e5BC4830B6947");
const ADMIN_WALLET = getAddress("0x0217C435A8C4a104E641CFA438E582716c862d9B");
const HASH = `0x${"ef".repeat(32)}`;

const admin = clerkUser({
  id: "user_admin",
  email: "admin@college.edu.in",
  wallets: [ADMIN_WALLET],
  publicMetadata: { role: "admin" },
});
const arbiter = clerkUser({
  id: "user_arbiter",
  email: "security@college.edu.in",
  wallets: [ARBITER_WALLET],
  publicMetadata: { role: "arbiter" },
});
const student = clerkUser({ publicMetadata: { role: "student" } });

const resolveBody = {
  action: "resolve_dispute",
  txHash: HASH,
  itemId: "14",
  finderWins: true,
  note: "Checked CCTV at the library desk.",
};

const get = (url: string) => new Request(`http://localhost${url}`);

beforeEach(() => {
  vi.clearAllMocks();
  db = fakeDb();
  actorEmails.mockResolvedValue(new Map());
});

describe("POST /api/admin/actions", () => {
  it("records an arbiter's dispute decision from the verified receipt", async () => {
    signIn(arbiter);
    verifyAdminTx.mockResolvedValue({
      action: "resolve_dispute_finder",
      target: "14",
    });
    const row = { id: 1, action: "resolve_dispute_finder" };
    db = fakeDb([[], [row]]);

    const response = await actions.POST(
      jsonRequest("/api/admin/actions", resolveBody),
    );
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ action: row });
    expect(verifyAdminTx).toHaveBeenCalledWith(
      expect.objectContaining({ itemId: 14n, finderWins: true }),
      ARBITER_WALLET,
    );
    const values = db.calls.find((c) => c.method === "values");
    expect(values?.args[0]).toEqual({
      actorClerkId: "user_arbiter",
      action: "resolve_dispute_finder",
      target: "14",
      txHash: HASH,
      note: "Checked CCTV at the library desk.",
    });
  });

  it("returns the existing entry for a transaction already recorded", async () => {
    signIn(arbiter);
    const existing = { id: 9, txHash: HASH };
    db = fakeDb([[existing]]);
    const response = await actions.POST(
      jsonRequest("/api/admin/actions", resolveBody),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ action: existing });
    expect(verifyAdminTx).not.toHaveBeenCalled();
  });

  it("returns the entry another request saved while the receipt was checked", async () => {
    signIn(arbiter);
    verifyAdminTx.mockResolvedValue({
      action: "resolve_dispute_finder",
      target: "14",
    });
    const winner = { id: 9, txHash: HASH };
    db = fakeDb([[], [], [winner]]);
    const response = await actions.POST(
      jsonRequest("/api/admin/actions", resolveBody),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ action: winner });
    expect(db.calls.some((c) => c.method === "onConflictDoNothing")).toBe(true);
  });

  it("lets only admins record settings and pause changes", async () => {
    signIn(arbiter);
    const response = await actions.POST(
      jsonRequest("/api/admin/actions", { action: "pause", txHash: HASH }),
    );
    expect(response.status).toBe(403);

    signIn(admin);
    verifyAdminTx.mockResolvedValue({ action: "pause", target: "contract" });
    db = fakeDb([[], [{ id: 2 }]]);
    const ok = await actions.POST(
      jsonRequest("/api/admin/actions", {
        action: "pause",
        txHash: HASH,
        note: "Investigating spam posts.",
      }),
    );
    expect(ok.status).toBe(201);
    expect(verifyAdminTx).toHaveBeenCalledWith(
      { action: "pause", txHash: HASH, note: "Investigating spam posts." },
      ADMIN_WALLET,
    );
  });

  it("refuses students and signed-out callers", async () => {
    signIn(student);
    expect(
      (await actions.POST(jsonRequest("/api/admin/actions", resolveBody)))
        .status,
    ).toBe(403);
    signIn(null);
    expect(
      (await actions.POST(jsonRequest("/api/admin/actions", resolveBody)))
        .status,
    ).toBe(401);
    expect(verifyAdminTx).not.toHaveBeenCalled();
  });

  it("needs a note on a dispute decision", async () => {
    signIn(arbiter);
    const response = await actions.POST(
      jsonRequest("/api/admin/actions", { ...resolveBody, note: "" }),
    );
    expect(response.status).toBe(400);
    expect(verifyAdminTx).not.toHaveBeenCalled();
  });

  it("needs a linked wallet to match the transaction against", async () => {
    signIn(clerkUser({ wallets: [], publicMetadata: { role: "arbiter" } }));
    const response = await actions.POST(
      jsonRequest("/api/admin/actions", resolveBody),
    );
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      error: { code: "WALLET_NOT_LINKED" },
    });
  });

  it("passes on the receipt check's refusal and saves nothing", async () => {
    signIn(arbiter);
    db = fakeDb([[]]);
    verifyAdminTx.mockRejectedValue(
      new ApiError(
        403,
        "FORBIDDEN",
        "That transaction wasn't sent from the wallet linked to your account.",
      ),
    );
    const response = await actions.POST(
      jsonRequest("/api/admin/actions", resolveBody),
    );
    expect(response.status).toBe(403);
    expect(db.calls.some((c) => c.method === "insert")).toBe(false);
  });
});

describe("GET /api/admin/actions", () => {
  it("lists entries newest first with actor and student emails", async () => {
    signIn(admin);
    const rows = [
      {
        id: 2,
        actorClerkId: "user_admin",
        action: "revoke_student",
        target: "user_1",
        txHash: null,
        note: null,
        createdAt: "2026-10-04T10:00:00.000Z",
      },
      {
        id: 1,
        actorClerkId: "clerk-webhook",
        action: "revoke_student",
        target: "user_2",
        txHash: null,
        note: null,
        createdAt: "2026-10-03T10:00:00.000Z",
      },
    ];
    db = fakeDb([
      rows,
      [{ total: 2 }],
      [{ id: "user_1", email: "riya@college.edu.in" }],
    ]);
    actorEmails.mockResolvedValue(
      new Map([["user_admin", "admin@college.edu.in"]]),
    );

    const response = await actions.GET(get("/api/admin/actions?page=1"));
    const body = await response.json();
    expect(body.total).toBe(2);
    expect(body.actions[0]).toMatchObject({
      actorEmail: "admin@college.edu.in",
      targetEmail: "riya@college.edu.in",
    });
    expect(body.actions[1]).toMatchObject({
      actorEmail: null,
      targetEmail: null,
    });
    expect(db.calls.find((c) => c.method === "orderBy")).toBeDefined();
  });

  it("is for admins only", async () => {
    signIn(arbiter);
    expect((await actions.GET(get("/api/admin/actions"))).status).toBe(403);
  });
});

describe("GET /api/admin/disputes", () => {
  it("serves admins and arbiters, with bigints as strings", async () => {
    listDisputes.mockResolvedValue([
      {
        item: { id: 14n, reward: 10n ** 15n },
        ownerEmail: "riya@college.edu.in",
        finderEmail: null,
      },
    ]);
    for (const user of [admin, arbiter]) {
      signIn(user);
      const response = await disputes.GET();
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        disputes: [
          {
            item: { id: "14", reward: "1000000000000000" },
            ownerEmail: "riya@college.edu.in",
            finderEmail: null,
          },
        ],
      });
    }
  });

  it("refuses students", async () => {
    signIn(student);
    expect((await disputes.GET()).status).toBe(403);
    expect(listDisputes).not.toHaveBeenCalled();
  });
});

describe("GET /api/admin/overview", () => {
  it("returns the verifier balance and student counts", async () => {
    signIn(admin);
    getBalance.mockResolvedValue(15_000_000_000_000_000n);
    db = fakeDb([
      [
        { status: "verified", total: 4 },
        { status: "failed", total: 1 },
      ],
    ]);
    const response = await overview.GET();
    expect(await response.json()).toEqual({
      verifier: { address: VERIFIER, balance: "15000000000000000" },
      students: { pending: 0, verified: 4, failed: 1, revoked: 0 },
    });
    expect(getBalance).toHaveBeenCalledWith({ address: VERIFIER });
  });

  it("is for admins only", async () => {
    signIn(arbiter);
    expect((await overview.GET()).status).toBe(403);
  });
});
