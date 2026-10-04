import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { clerkMocks, clerkServerModule, fakeDb, WALLET } from "@/test/fakes";

vi.mock("@clerk/nextjs/server", () => clerkServerModule());

const verifyWebhook = vi.fn();
vi.mock("@clerk/nextjs/webhooks", () => ({
  verifyWebhook: (...args: unknown[]) => verifyWebhook(...args),
}));

const getStudent = vi.fn();
vi.mock("@/lib/students", () => ({
  getStudent: (...args: unknown[]) => getStudent(...args),
}));

const revokeOnChain = vi.fn();
vi.mock("@/lib/verifier", () => ({
  revokeOnChain: (...args: unknown[]) => revokeOnChain(...args),
}));

let db = fakeDb();
vi.mock("@/lib/db", async (original) => ({
  ...(await original<typeof import("@/lib/db/schema")>()),
  getDb: () => db.db,
}));

const { POST } = await import("../webhooks/clerk/route");

const request = () =>
  new NextRequest("http://localhost/api/webhooks/clerk", {
    method: "POST",
    body: "{}",
  });

function userEvent(
  type: string,
  email: string,
  publicMetadata: Record<string, unknown> = {},
) {
  return {
    type,
    data: {
      id: "user_1",
      primary_email_address_id: "e1",
      email_addresses: [
        {
          id: "e1",
          email_address: email,
          verification: { status: "verified" },
        },
      ],
      web3_wallets: [],
      public_metadata: publicMetadata,
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("ALLOWED_EMAIL_DOMAIN", "college.edu.in");
  db = fakeDb();
});

describe("POST /api/webhooks/clerk", () => {
  it("rejects a bad signature with 400 and does nothing", async () => {
    verifyWebhook.mockRejectedValue(new Error("No matching signature found"));
    const response = await POST(request());
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("BAD_REQUEST");
    expect(clerkMocks.updateUserMetadata).not.toHaveBeenCalled();
  });

  it("flags a new account outside the college domain as ineligible", async () => {
    verifyWebhook.mockResolvedValue(
      userEvent("user.created", "riya@gmail.com"),
    );
    expect((await POST(request())).status).toBe(200);
    expect(clerkMocks.updateUserMetadata).toHaveBeenCalledWith("user_1", {
      publicMetadata: { ineligible: true },
    });
  });

  it("leaves a college account alone", async () => {
    verifyWebhook.mockResolvedValue(
      userEvent("user.created", "riya@college.edu.in"),
    );
    expect((await POST(request())).status).toBe(200);
    expect(clerkMocks.updateUserMetadata).not.toHaveBeenCalled();
  });

  it("only writes when the flag changes (each write fires another user.updated)", async () => {
    verifyWebhook.mockResolvedValue(
      userEvent("user.updated", "riya@gmail.com", { ineligible: true }),
    );
    await POST(request());
    expect(clerkMocks.updateUserMetadata).not.toHaveBeenCalled();

    verifyWebhook.mockResolvedValue(
      userEvent("user.updated", "riya@college.edu.in", { ineligible: true }),
    );
    await POST(request());
    expect(clerkMocks.updateUserMetadata).toHaveBeenCalledWith("user_1", {
      publicMetadata: { ineligible: false },
    });
  });

  it("revokes a deleted user's wallet on-chain, marks the row revoked and logs it", async () => {
    verifyWebhook.mockResolvedValue({
      type: "user.deleted",
      data: { id: "user_1", deleted: true },
    });
    getStudent.mockResolvedValue({
      clerkUserId: "user_1",
      walletAddress: WALLET.toLowerCase(),
      status: "verified",
    });
    revokeOnChain.mockResolvedValue(`0x${"2".repeat(64)}`);
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(revokeOnChain).toHaveBeenCalledWith(WALLET);
    const methods = db.calls.map((call) => call.method);
    expect(methods).toContain("update");
    expect(methods).toContain("insert");
  });

  it("asks Clerk to retry (5xx) when the revoke fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    verifyWebhook.mockResolvedValue({
      type: "user.deleted",
      data: { id: "user_1", deleted: true },
    });
    getStudent.mockResolvedValue({
      clerkUserId: "user_1",
      walletAddress: WALLET.toLowerCase(),
      status: "verified",
    });
    revokeOnChain.mockRejectedValue(new Error("RPC down"));
    const response = await POST(request());
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("RPC down");
  });

  it("ignores a deleted user with no student row", async () => {
    verifyWebhook.mockResolvedValue({
      type: "user.deleted",
      data: { id: "user_9", deleted: true },
    });
    getStudent.mockResolvedValue(null);
    expect((await POST(request())).status).toBe(200);
    expect(revokeOnChain).not.toHaveBeenCalled();
  });
});
