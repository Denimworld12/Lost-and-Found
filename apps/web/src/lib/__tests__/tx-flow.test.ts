import { lostAndFoundAbi } from "@clf/shared";
import {
  BaseError,
  ContractFunctionExecutionError,
  ContractFunctionRevertedError,
  encodeErrorResult,
  getAddress,
  InsufficientFundsError,
  UserRejectedRequestError,
  type Address,
  type Hash,
  type TransactionReceipt,
} from "viem";
import { describe, expect, it, vi } from "vitest";
import {
  CONTRACT_ERROR_MESSAGES,
  INSUFFICIENT_FUNDS_MESSAGE,
  USER_REJECTED_MESSAGE,
} from "../errors";
import {
  executeTx,
  NOT_CONNECTED_MESSAGE,
  ownTxHashes,
  RECEIPT_TIMEOUT_MESSAGE,
  REVERTED_MESSAGE,
  WRONG_CHAIN_MESSAGE,
  wrongWalletMessage,
  type TxFlowDeps,
  type TxRequest,
  type TxSnapshot,
} from "../tx-flow";

const SEPOLIA = 11155111;
const STUDENT = getAddress("0xc3094e09bb56e350bcdd9039ae2ce3e73d3900cf");
const OTHER = getAddress("0x3ba2113c559f36040366477d26e286ffae8928a1");
const HASH = `0x${"ab".repeat(32)}` as Hash;

/** The error viem throws when `simulateContract` or a gas estimate hits a custom error. */
function revert(errorName: string, args?: readonly unknown[]) {
  const data = encodeErrorResult({
    abi: lostAndFoundAbi,
    errorName,
    args,
  } as Parameters<typeof encodeErrorResult>[0]);
  const cause = new ContractFunctionRevertedError({
    abi: lostAndFoundAbi,
    data,
    functionName: "claimItem",
  });
  return new ContractFunctionExecutionError(cause, {
    abi: lostAndFoundAbi,
    functionName: "claimItem",
    args: [1n],
    contractAddress: STUDENT,
  });
}

function receipt(status: "success" | "reverted"): TransactionReceipt {
  return {
    status,
    logs: [],
    transactionHash: HASH,
  } as unknown as TransactionReceipt;
}

function deps(overrides: Partial<TxFlowDeps> = {}): TxFlowDeps {
  return {
    chainId: SEPOLIA,
    linkedWallet: STUDENT,
    getConnection: () => ({ address: STUDENT, chainId: SEPOLIA }),
    switchChain: vi.fn(async () => undefined),
    estimateGas: vi.fn(async () => 100_000n),
    maxFeePerGas: vi.fn(async () => 2_000_000_000n),
    getBalance: vi.fn(async () => 10n ** 18n),
    simulate: vi.fn(async () => ({ prepared: true })),
    write: vi.fn(async () => HASH),
    waitForReceipt: vi.fn(async () => receipt("success")),
    ...overrides,
  };
}

const CLAIM: TxRequest = {
  functionName: "claimItem",
  args: [1n],
  value: 500_000_000_000_000n,
  itemId: 1n,
  successMessage: "Claim sent",
};

async function run(d: TxFlowDeps, request: TxRequest = CLAIM) {
  const states: TxSnapshot[] = [];
  const result = await executeTx(d, request, (s) => states.push(s));
  return { result, states: states.map((s) => s.state) };
}

describe("executeTx", () => {
  it("walks checking → awaitingWallet → pending → confirmed", async () => {
    const d = deps();
    const { result, states } = await run(d);
    expect(result.state).toBe("confirmed");
    expect(result.hash).toBe(HASH);
    expect(result.step).toBe("confirmed");
    expect(states).toEqual([
      "checking",
      "awaitingWallet",
      "pending",
      "confirmed",
    ]);
    expect(d.simulate).toHaveBeenCalledWith({
      functionName: "claimItem",
      args: [1n],
      value: 500_000_000_000_000n,
      account: STUDENT,
    });
    expect(d.write).toHaveBeenCalledWith({ prepared: true });
    expect(ownTxHashes.has(HASH)).toBe(true);
  });

  it("fails without a connected wallet", async () => {
    const d = deps({ getConnection: () => ({}) });
    const { result } = await run(d);
    expect(result).toMatchObject({
      state: "failed",
      error: NOT_CONNECTED_MESSAGE,
    });
    expect(d.simulate).not.toHaveBeenCalled();
  });

  it("switches to Sepolia first, and treats a rejected switch as cancelled", async () => {
    let chainId = 1;
    const switched = deps({
      getConnection: () => ({ address: STUDENT, chainId }),
      switchChain: vi.fn(async () => {
        chainId = SEPOLIA;
      }),
    });
    expect((await run(switched)).result.state).toBe("confirmed");
    expect(switched.switchChain).toHaveBeenCalledWith(SEPOLIA);

    const rejected = deps({
      getConnection: () => ({ address: STUDENT, chainId: 1 }),
      switchChain: vi.fn(async () => {
        throw new UserRejectedRequestError(
          new Error("User rejected the request."),
        );
      }),
    });
    expect((await run(rejected)).result).toMatchObject({
      state: "cancelled",
      error: USER_REJECTED_MESSAGE,
    });

    const failed = deps({
      getConnection: () => ({ address: STUDENT, chainId: 1 }),
      switchChain: vi.fn(async () => {
        throw new Error("Unrecognized chain");
      }),
    });
    expect((await run(failed)).result.error).toBe(WRONG_CHAIN_MESSAGE);
  });

  it("blocks writes from a wallet other than the linked one", async () => {
    const d = deps({
      getConnection: () => ({ address: OTHER, chainId: SEPOLIA }),
    });
    const { result } = await run(d);
    expect(result).toMatchObject({
      state: "failed",
      error: wrongWalletMessage(STUDENT),
    });
    expect(result.error).toMatch(
      /^Switch MetaMask to your registered wallet 0xc3…00c[fF]\.$/,
    );
    expect(d.estimateGas).not.toHaveBeenCalled();
  });

  it("compares addresses case-insensitively", async () => {
    const d = deps({
      getConnection: () => ({
        address: STUDENT.toLowerCase() as Address,
        chainId: SEPOLIA,
      }),
    });
    expect((await run(d)).result.state).toBe("confirmed");
  });

  it("shows the NotVerified copy when no wallet is linked yet", async () => {
    const { result } = await run(deps({ linkedWallet: null }));
    expect(result.error).toBe(CONTRACT_ERROR_MESSAGES.NotVerified);
  });

  it("shows the NotVerified copy when the contract refuses an unverified wallet", async () => {
    const d = deps({
      estimateGas: vi.fn(async () => {
        throw revert("NotVerified");
      }),
    });
    const { result, states } = await run(d);
    expect(result).toMatchObject({
      state: "failed",
      error: "Finish activating your account before posting or claiming.",
    });
    expect(states).toEqual(["checking", "failed"]);
    expect(d.write).not.toHaveBeenCalled();
  });

  it("stops before MetaMask when value + gas exceeds the balance", async () => {
    const d = deps({ getBalance: vi.fn(async () => 500_000_000_000_000n) });
    const { result } = await run(d);
    expect(result.error).toBe(INSUFFICIENT_FUNDS_MESSAGE);
    expect(d.simulate).not.toHaveBeenCalled();
  });

  it("maps a simulation revert to copy with no wallet popup", async () => {
    const d = deps({
      simulate: vi.fn(async () => {
        throw revert("WrongStatus", [1, 2]);
      }),
    });
    const { result } = await run(d);
    expect(result.error).toBe(
      "This item changed status. Refresh to see the latest.",
    );
    expect(d.write).not.toHaveBeenCalled();
  });

  it("fills WindowOpen with the window end from the request", async () => {
    const d = deps({
      simulate: vi.fn(async () => {
        throw revert("WindowOpen");
      }),
    });
    const { result } = await run(d, {
      ...CLAIM,
      functionName: "claimAfterTimeout",
      value: undefined,
      errorContext: { windowEndsAt: 1_791_100_000n },
    });
    expect(result.error).toMatch(
      /^You can collect after .+ if the owner hasn't responded\.$/,
    );
  });

  it("treats a MetaMask rejection as cancelled, not failed", async () => {
    const d = deps({
      write: vi.fn(async () => {
        throw new UserRejectedRequestError(
          new Error("User rejected the request."),
        );
      }),
    });
    const { result, states } = await run(d);
    expect(result).toMatchObject({
      state: "cancelled",
      error: USER_REJECTED_MESSAGE,
    });
    expect(states).toEqual(["checking", "awaitingWallet", "cancelled"]);
  });

  it("maps insufficient funds reported by the wallet", async () => {
    const d = deps({
      write: vi.fn(async () => {
        throw new InsufficientFundsError({
          cause: new BaseError("insufficient funds"),
        });
      }),
    });
    expect((await run(d)).result.error).toBe(INSUFFICIENT_FUNDS_MESSAGE);
  });

  it("fails with generic copy when the receipt says reverted", async () => {
    const d = deps({ waitForReceipt: vi.fn(async () => receipt("reverted")) });
    const { result } = await run(d);
    expect(result).toMatchObject({
      state: "failed",
      error: REVERTED_MESSAGE,
      hash: HASH,
    });
  });

  it("keeps the hash when the receipt wait times out", async () => {
    const d = deps({
      waitForReceipt: vi.fn(async () => {
        throw new Error("timeout");
      }),
    });
    const { result } = await run(d);
    expect(result).toMatchObject({
      state: "failed",
      error: RECEIPT_TIMEOUT_MESSAGE,
      hash: HASH,
    });
  });

  it("runs prepare after the wallet checks and uses its args", async () => {
    const order: string[] = [];
    const d = deps({
      estimateGas: vi.fn(async (call) => {
        order.push(`estimate:${String(call.args[0])}`);
        return 1n;
      }),
    });
    const prepare = vi.fn(async () => {
      order.push("prepare");
      return { args: ["bafycid"] };
    });
    const states: TxSnapshot[] = [];
    const result = await executeTx(
      d,
      {
        functionName: "postItem",
        args: [""],
        value: 1n,
        successMessage: "Item posted",
        prepare,
      },
      (s) => states.push(s),
    );
    expect(result.state).toBe("confirmed");
    expect(result.prepared).toBe(true);
    expect(order).toEqual(["prepare", "estimate:bafycid"]);
    expect(states.some((s) => s.step === "prepare")).toBe(true);
  });

  it("skips prepare when a wallet check fails, and shows prepare's own error", async () => {
    const prepare = vi.fn(async () => ({ args: ["x"] }));
    await run(deps({ linkedWallet: null }), { ...CLAIM, prepare });
    expect(prepare).not.toHaveBeenCalled();

    const { result } = await run(deps(), {
      ...CLAIM,
      prepare: async () => {
        throw new Error("You can upload 5 items an hour. Try again later.");
      },
    });
    expect(result).toMatchObject({
      state: "failed",
      step: "prepare",
      prepared: false,
      error: "You can upload 5 items an hour. Try again later.",
    });
  });
});
