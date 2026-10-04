import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clerkServerModule,
  clerkUser,
  jsonRequest,
  signIn,
  WALLET,
} from "@/test/fakes";

vi.mock("@clerk/nextjs/server", () => clerkServerModule());

const getStudent = vi.fn();
const activateStudent = vi.fn();
vi.mock("@/lib/students", () => ({
  getStudent: (...args: unknown[]) => getStudent(...args),
  activateStudent: (...args: unknown[]) => activateStudent(...args),
}));

const readIsVerified = vi.fn();
const getBalance = vi.fn();
vi.mock("@/lib/contract", () => ({
  readIsVerified: (...args: unknown[]) => readIsVerified(...args),
  getPublicClient: () => ({ getBalance }),
}));

const { GET: status } = await import("../onboarding/status/route");
const { POST: verify } = await import("../onboarding/verify/route");

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("ALLOWED_EMAIL_DOMAIN", "college.edu.in");
  getStudent.mockResolvedValue(null);
  readIsVerified.mockResolvedValue(false);
  getBalance.mockResolvedValue(0n);
});

describe("GET /api/onboarding/status", () => {
  it("is 401 when signed out", async () => {
    signIn(null);
    const response = await status();
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: { code: "UNAUTHENTICATED", message: "Sign in to continue." },
    });
  });

  it("reports a fresh college user with no wallet", async () => {
    signIn(clerkUser({ wallets: [] }));
    const body = await (await status()).json();
    expect(body).toMatchObject({
      email: "riya@college.edu.in",
      emailOk: true,
      walletLinked: false,
      wallet: null,
      studentStatus: "none",
      onchainVerified: false,
      balance: null,
      hasGas: false,
    });
  });

  it("flags a non-college email and never reads the student row", async () => {
    signIn(clerkUser({ email: "riya@gmail.com", wallets: [] }));
    const body = await (await status()).json();
    expect(body.emailOk).toBe(false);
    expect(getStudent).not.toHaveBeenCalled();
  });

  it("reports wallet, balance as a wei string, gas and the pending tx", async () => {
    signIn(clerkUser());
    getBalance.mockResolvedValue(3_000_000_000_000_000n);
    getStudent.mockResolvedValue({
      walletAddress: WALLET.toLowerCase(),
      status: "pending",
      verifyTxHash: `0x${"1".repeat(64)}`,
      error: null,
    });
    const body = await (await status()).json();
    expect(body).toMatchObject({
      walletLinked: true,
      wallet: WALLET,
      balance: "3000000000000000",
      hasGas: true,
      studentStatus: "pending",
      verifyTxHash: `0x${"1".repeat(64)}`,
    });
  });

  it("ignores a row for a wallet the student no longer has linked", async () => {
    signIn(clerkUser());
    getStudent.mockResolvedValue({
      walletAddress: "0x0000000000000000000000000000000000000001",
      status: "verified",
      verifyTxHash: null,
      error: null,
    });
    expect((await (await status()).json()).studentStatus).toBe("none");
  });

  it("is 503 with a safe message when the college domain isn't configured", async () => {
    vi.stubEnv("ALLOWED_EMAIL_DOMAIN", "");
    vi.spyOn(console, "error").mockImplementation(() => {});
    signIn(clerkUser());
    const response = await status();
    expect(response.status).toBe(503);
    const text = await response.text();
    expect(text).toContain("NOT_CONFIGURED");
    expect(text).not.toContain("ALLOWED_EMAIL_DOMAIN");
  });
});

describe("POST /api/onboarding/verify", () => {
  it("refuses a non-college account with 403 NOT_ELIGIBLE", async () => {
    signIn(clerkUser({ email: "riya@gmail.com" }));
    const response = await verify(jsonRequest("/api/onboarding/verify", {}));
    expect(response.status).toBe(403);
    expect((await response.json()).error.code).toBe("NOT_ELIGIBLE");
    expect(activateStudent).not.toHaveBeenCalled();
  });

  it("refuses an unverified primary email", async () => {
    signIn(clerkUser({ emailVerified: false }));
    const response = await verify(jsonRequest("/api/onboarding/verify", {}));
    expect(response.status).toBe(403);
  });

  it("needs a linked wallet", async () => {
    signIn(clerkUser({ wallets: [] }));
    const response = await verify(jsonRequest("/api/onboarding/verify", {}));
    expect((await response.json()).error.code).toBe("WALLET_NOT_LINKED");
  });

  it("refuses to guess between two linked wallets", async () => {
    signIn(
      clerkUser({
        wallets: [WALLET, "0x3ba2113c559f36040366477d26e286ffae8928a1"],
      }),
    );
    const response = await verify(jsonRequest("/api/onboarding/verify", {}));
    expect(response.status).toBe(409);
    expect((await response.json()).error.code).toBe("MULTIPLE_WALLETS");
  });

  it("ignores any wallet sent in the body: only Clerk's linked wallet is used", async () => {
    signIn(clerkUser());
    const response = await verify(
      jsonRequest("/api/onboarding/verify", {
        wallet: "0x0000000000000000000000000000000000000001",
      }),
    );
    expect(response.status).toBe(400);
    expect(activateStudent).not.toHaveBeenCalled();
  });

  it("activates the linked wallet and returns the result", async () => {
    const user = clerkUser({ publicMetadata: { role: "admin" } });
    signIn(user);
    activateStudent.mockResolvedValue({
      status: "verified",
      wallet: WALLET,
      txHash: null,
    });
    const response = await verify(jsonRequest("/api/onboarding/verify"));
    expect(response.status).toBe(200);
    expect(activateStudent).toHaveBeenCalledWith({
      clerkUserId: "user_1",
      email: "riya@college.edu.in",
      wallet: WALLET,
      publicMetadata: { role: "admin" },
    });
    expect(await response.json()).toEqual({
      status: "verified",
      wallet: WALLET,
      txHash: null,
    });
  });

  it("passes a chain failure through as a typed error", async () => {
    signIn(clerkUser());
    const { ApiError } = await import("@/lib/api");
    activateStudent.mockRejectedValue(
      new ApiError(
        502,
        "CHAIN_ERROR",
        "Try again in a minute.",
        "nonce too low",
      ),
    );
    vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await verify(jsonRequest("/api/onboarding/verify", {}));
    expect(response.status).toBe(502);
    expect(await response.text()).not.toContain("nonce");
  });
});
