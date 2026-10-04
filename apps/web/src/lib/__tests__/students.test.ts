import { getAddress } from "viem";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { clerkServerModule, fakeDb, WALLET } from "@/test/fakes";

vi.mock("@clerk/nextjs/server", () => clerkServerModule());

const verifyOnChain = vi.fn();
const revokeOnChain = vi.fn();
vi.mock("@/lib/verifier", () => ({
  verifyOnChain: (...args: unknown[]) => verifyOnChain(...args),
  revokeOnChain: (...args: unknown[]) => revokeOnChain(...args),
}));

let db = fakeDb();
vi.mock("@/lib/db", async (original) => ({
  ...(await original<typeof import("@/lib/db/schema")>()),
  getDb: () => db.db,
}));

const { activateStudent } = await import("../students");

const OLD_WALLET = "0x3ba2113c559f36040366477d26e286ffae8928a1";

function existingRow(status: string) {
  return {
    clerkUserId: "user_1",
    email: "riya@college.edu.in",
    walletAddress: OLD_WALLET,
    status,
    verifiedAt: null,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  verifyOnChain.mockResolvedValue(null);
  revokeOnChain.mockResolvedValue(null);
});

describe("activateStudent", () => {
  it.each(["verified", "failed", "pending"])(
    "takes the old wallet off the whitelist when a %s student switches wallets",
    async (status) => {
      db = fakeDb([[existingRow(status)], [], [], []]);
      await activateStudent({
        clerkUserId: "user_1",
        email: "riya@college.edu.in",
        wallet: WALLET,
        publicMetadata: {},
      });
      expect(revokeOnChain).toHaveBeenCalledWith(getAddress(OLD_WALLET));
      expect(verifyOnChain).toHaveBeenCalledWith(WALLET, expect.anything());
    },
  );

  it("leaves the whitelist alone when the wallet is unchanged", async () => {
    db = fakeDb([
      [{ ...existingRow("failed"), walletAddress: WALLET.toLowerCase() }],
      [],
      [],
      [],
    ]);
    await activateStudent({
      clerkUserId: "user_1",
      email: "riya@college.edu.in",
      wallet: WALLET,
      publicMetadata: {},
    });
    expect(revokeOnChain).not.toHaveBeenCalled();
  });
});
