import { decodeFunctionData, getAddress, maxUint128, parseEther } from "viem";
import { describe, expect, it } from "vitest";
import {
  configTarget,
  decideRoleAccess,
  describeConfig,
  disputeAction,
  encodeAdminCall,
  logActionSchema,
  parseConfigForm,
  parseConfigTarget,
  safeAppUrl,
  sameConfig,
  toConfigForm,
  type ConfigForm,
} from "../admin";
import { lostAndFound } from "../contract";

const CURRENT = {
  minReward: parseEther("0.001"),
  claimStake: parseEther("0.0005"),
  confirmWindow: 259_200n,
};
const FORM: ConfigForm = {
  minReward: "0.001",
  claimStake: "0.0005",
  windowValue: "3",
  windowUnit: "days",
};
const HASH = `0x${"ab".repeat(32)}`;
const ME = getAddress("0x9FF4CD7D8DaF39334b469D7C009e5BC4830B6947");
const SAFE = getAddress("0x0217C435A8C4a104E641CFA438E582716c862d9B");

describe("settings form", () => {
  it("shows the current config in the largest whole unit", () => {
    expect(toConfigForm(CURRENT)).toEqual(FORM);
    expect(toConfigForm({ ...CURRENT, confirmWindow: 300n })).toMatchObject({
      windowValue: "5",
      windowUnit: "minutes",
    });
    expect(toConfigForm({ ...CURRENT, confirmWindow: 7200n })).toMatchObject({
      windowValue: "2",
      windowUnit: "hours",
    });
  });

  it("round-trips to the same values", () => {
    const parsed = parseConfigForm(FORM);
    expect(parsed).toEqual({ values: CURRENT });
    expect("values" in parsed && sameConfig(parsed.values, CURRENT)).toBe(true);
  });

  it("enforces the contract's bounds", () => {
    expect(
      parseConfigForm({ ...FORM, windowValue: "4", windowUnit: "minutes" }),
    ).toEqual({
      errors: { confirmWindow: "The window must be 5 minutes to 14 days." },
    });
    expect(
      parseConfigForm({ ...FORM, windowValue: "15", windowUnit: "days" }),
    ).toHaveProperty("errors.confirmWindow");
    expect(
      parseConfigForm({ ...FORM, windowValue: "14", windowUnit: "days" }),
    ).toHaveProperty("values.confirmWindow", 1_209_600n);
    expect(
      parseConfigForm({ ...FORM, windowValue: "5", windowUnit: "minutes" }),
    ).toHaveProperty("values.confirmWindow", 300n);
    expect(parseConfigForm({ ...FORM, minReward: "0" })).toEqual({
      errors: { minReward: "The minimum reward must be more than 0." },
    });
    expect(parseConfigForm({ ...FORM, claimStake: "" })).toEqual({
      errors: { claimStake: "Enter the deposit." },
    });
    expect(parseConfigForm({ ...FORM, claimStake: "1e18" })).toHaveProperty(
      "errors.claimStake",
    );
    const tooBig = (maxUint128 / 10n ** 18n + 1n).toString();
    expect(parseConfigForm({ ...FORM, minReward: tooBig })).toEqual({
      errors: { minReward: "That minimum reward is too large." },
    });
    expect(parseConfigForm({ ...FORM, windowValue: "1.5" })).toHaveProperty(
      "errors.confirmWindow",
    );
  });

  it("previews new settings in plain English", () => {
    expect(describeConfig({ ...CURRENT, confirmWindow: 300n })).toEqual([
      "Owners will have to offer at least 0.001 ETH.",
      "Finders will have to lock 0.0005 ETH.",
      "Owners will have 5 minutes to respond to new claims. Existing claims keep their window.",
    ]);
  });

  it("stores config changes as a parseable audit target", () => {
    const target = configTarget(CURRENT);
    expect(target).toBe(
      "minReward=1000000000000000 claimStake=500000000000000 confirmWindow=259200",
    );
    expect(parseConfigTarget(target)).toEqual(CURRENT);
    expect(parseConfigTarget("contract")).toBeNull();
  });
});

describe("audit log input", () => {
  const resolve = {
    action: "resolve_dispute",
    txHash: HASH,
    itemId: "14",
    finderWins: true,
    note: "Checked CCTV at the library desk.",
  };

  it("parses a dispute decision", () => {
    expect(logActionSchema.parse(resolve)).toEqual({
      ...resolve,
      itemId: 14n,
    });
    expect(disputeAction(true)).toBe("resolve_dispute_finder");
    expect(disputeAction(false)).toBe("resolve_dispute_owner");
  });

  it("requires a real note on a dispute decision", () => {
    expect(
      logActionSchema.safeParse({ ...resolve, note: "   ok   " }).success,
    ).toBe(false);
    expect(
      logActionSchema.safeParse({ ...resolve, note: undefined }).success,
    ).toBe(false);
  });

  it("allows settings and pause entries without a note", () => {
    expect(
      logActionSchema.parse({
        action: "pause",
        txHash: HASH.toUpperCase().replace("0X", "0x"),
      }),
    ).toEqual({ action: "pause", txHash: HASH });
    expect(
      logActionSchema.safeParse({ action: "set_config", txHash: HASH }).success,
    ).toBe(true);
  });

  it("rejects unknown actions, bad hashes and extra fields", () => {
    expect(
      logActionSchema.safeParse({ action: "grant_role", txHash: HASH }).success,
    ).toBe(false);
    expect(
      logActionSchema.safeParse({ action: "pause", txHash: "0x1234" }).success,
    ).toBe(false);
    expect(
      logActionSchema.safeParse({
        action: "pause",
        txHash: HASH,
        actorClerkId: "user_admin",
      }).success,
    ).toBe(false);
    expect(logActionSchema.safeParse({ ...resolve, itemId: "0" }).success).toBe(
      false,
    );
  });
});

describe("Safe proposals", () => {
  it("encodes the call for the contract with no ETH", () => {
    const tx = encodeAdminCall({
      functionName: "resolveDispute",
      args: [14n, false],
    });
    expect(tx.to).toBe(lostAndFound.address);
    expect(tx.value).toBe("0");
    expect(
      decodeFunctionData({ abi: lostAndFound.abi, data: tx.data }),
    ).toEqual({ functionName: "resolveDispute", args: [14n, false] });
    const config = encodeAdminCall({
      functionName: "setConfig",
      args: [CURRENT.minReward, CURRENT.claimStake, 300n],
    });
    expect(
      decodeFunctionData({ abi: lostAndFound.abi, data: config.data }),
    ).toEqual({
      functionName: "setConfig",
      args: [CURRENT.minReward, CURRENT.claimStake, 300n],
    });
    expect(encodeAdminCall({ functionName: "pause", args: [] }).data).toBe(
      "0x8456cb59",
    );
  });

  it("links to the Safe on Sepolia", () => {
    expect(safeAppUrl(SAFE)).toBe(
      `https://app.safe.global/home?safe=sep:${SAFE}`,
    );
  });
});

describe("decideRoleAccess", () => {
  const base = {
    walletLoading: false,
    account: ME,
    holders: [ME],
    contractHolders: [],
    holds: true,
  };

  it("waits for the wallet, the holders and the role check", () => {
    expect(decideRoleAccess({ ...base, walletLoading: true }).kind).toBe(
      "loading",
    );
    expect(decideRoleAccess({ ...base, holders: null }).kind).toBe("loading");
    expect(decideRoleAccess({ ...base, contractHolders: null }).kind).toBe(
      "loading",
    );
    expect(decideRoleAccess({ ...base, holds: null }).kind).toBe("loading");
  });

  it("writes directly when the connected wallet holds the role", () => {
    expect(decideRoleAccess(base)).toEqual({ kind: "direct", holders: [ME] });
  });

  it("explains a missing role when no Safe holds it", () => {
    expect(
      decideRoleAccess({ ...base, holders: [SAFE], holds: false }),
    ).toEqual({ kind: "missing", account: ME, holders: [SAFE] });
  });

  it("proposes in Safe when a contract holds the role", () => {
    const safeHeld = {
      ...base,
      holders: [SAFE],
      contractHolders: [SAFE],
      holds: false,
    };
    expect(decideRoleAccess(safeHeld)).toEqual({
      kind: "safe",
      safe: SAFE,
      holders: [SAFE],
    });
    // No wallet needed to copy a proposal.
    expect(
      decideRoleAccess({ ...safeHeld, account: null, holds: null }).kind,
    ).toBe("safe");
    // A wallet that holds the role itself still writes directly.
    expect(decideRoleAccess({ ...safeHeld, holds: true }).kind).toBe("direct");
  });

  it("asks for a wallet when none is connected and no Safe holds the role", () => {
    expect(decideRoleAccess({ ...base, account: null, holds: null })).toEqual({
      kind: "wallet",
      holders: [ME],
    });
  });
});
