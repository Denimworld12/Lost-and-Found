import { BaseError, type Address, type Hash, type PublicClient } from "viem";
import { describe, expect, it, vi } from "vitest";
import { ApiError } from "../api";
import { createVerifier, type VerifierDeps } from "../verifier";

const STUDENT: Address = "0xc3094e09bB56E350bCDd9039aE2ce3E73D3900cF";
const HASH: Hash = `0x${"ab".repeat(32)}`;

function setup({
  verified = [false, false],
  receiptStatus = "success",
  writeError,
}: {
  /** `isVerified` answers in call order (before the lock, inside the lock). */
  verified?: boolean[];
  receiptStatus?: "success" | "reverted";
  writeError?: Error;
} = {}) {
  const answers = [...verified];
  const events: string[] = [];
  const publicClient = {
    readContract: vi.fn(async () => {
      events.push("read");
      return answers.shift() ?? false;
    }),
    simulateContract: vi.fn(async (args: { functionName: string }) => {
      events.push(`simulate:${args.functionName}`);
      return { request: { functionName: args.functionName } };
    }),
    waitForTransactionReceipt: vi.fn(async (args: { timeout: number }) => {
      events.push(`receipt:${args.timeout}`);
      return { status: receiptStatus };
    }),
  };
  const walletClient = {
    account: { address: "0x45933417B883B3ecb5eDB185c2a73823F3313016" },
    writeContract: vi.fn(async () => {
      events.push("write");
      if (writeError) throw writeError;
      return HASH;
    }),
  };
  const lock: VerifierDeps["lock"] = async (fn) => {
    events.push("lock");
    try {
      return await fn();
    } finally {
      events.push("unlock");
    }
  };
  const verifier = createVerifier({
    publicClient: publicClient as unknown as PublicClient,
    walletClient: walletClient as unknown as VerifierDeps["walletClient"],
    lock,
  });
  return { verifier, events, publicClient, walletClient };
}

describe("verifyOnChain", () => {
  it("simulates, sends under the lock, reports the hash, then waits 90 s for the receipt", async () => {
    const { verifier, events } = setup();
    const onSent = vi.fn();
    await expect(verifier.verifyOnChain(STUDENT, { onSent })).resolves.toBe(
      HASH,
    );
    expect(onSent).toHaveBeenCalledWith(HASH);
    expect(events).toEqual([
      "read",
      "lock",
      "read",
      "simulate:verifyStudent",
      "write",
      "unlock",
      "receipt:90000",
    ]);
  });

  it("skips an already verified wallet without taking the lock", async () => {
    const { verifier, events, walletClient } = setup({ verified: [true] });
    await expect(verifier.verifyOnChain(STUDENT)).resolves.toBeNull();
    expect(events).toEqual(["read"]);
    expect(walletClient.writeContract).not.toHaveBeenCalled();
  });

  it("re-checks inside the lock so a concurrent request doesn't send twice", async () => {
    const { verifier, walletClient } = setup({ verified: [false, true] });
    await expect(verifier.verifyOnChain(STUDENT)).resolves.toBeNull();
    expect(walletClient.writeContract).not.toHaveBeenCalled();
  });

  it("fails with CHAIN_ERROR when the transaction reverts", async () => {
    const { verifier } = setup({ receiptStatus: "reverted" });
    await expect(verifier.verifyOnChain(STUDENT)).rejects.toMatchObject({
      status: 502,
      code: "CHAIN_ERROR",
    });
  });

  it("hides RPC details behind a safe message", async () => {
    const { verifier } = setup({
      writeError: new BaseError("insufficient funds for gas * price + value", {
        details: "account 0x45…3016 balance 0",
      }),
    });
    const error = await verifier
      .verifyOnChain(STUDENT)
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).message).not.toMatch(/insufficient|0x45/);
    expect((error as ApiError).detail).toContain("insufficient funds");
  });
});

describe("revokeOnChain", () => {
  it("sends revokeStudent for a verified wallet", async () => {
    const { verifier, events } = setup({ verified: [true, true] });
    await expect(verifier.revokeOnChain(STUDENT)).resolves.toBe(HASH);
    expect(events).toContain("simulate:revokeStudent");
  });

  it("does nothing for a wallet that isn't verified", async () => {
    const { verifier, walletClient } = setup({ verified: [false] });
    await expect(verifier.revokeOnChain(STUDENT)).resolves.toBeNull();
    expect(walletClient.writeContract).not.toHaveBeenCalled();
  });
});
