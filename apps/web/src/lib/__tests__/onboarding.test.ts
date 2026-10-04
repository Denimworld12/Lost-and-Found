import { describe, expect, it } from "vitest";
import {
  currentStep,
  deriveSteps,
  onboardingStatusSchema,
  type OnboardingStatus,
} from "../onboarding";

const WALLET = "0xc3094e09bB56E350bCDd9039aE2ce3E73D3900cF";

const fresh: OnboardingStatus = {
  email: "riya@college.edu.in",
  emailOk: true,
  walletLinked: false,
  multipleWallets: false,
  wallet: null,
  studentStatus: "none",
  onchainVerified: false,
  balance: null,
  hasGas: false,
  verifyTxHash: null,
  error: null,
};

const at = (status: OnboardingStatus, connected = false) =>
  currentStep(deriveSteps(status, connected));

describe("onboarding steps", () => {
  it("stops at step 1 for a non-college email", () => {
    expect(at({ ...fresh, emailOk: false })).toBe("college");
  });

  it("walks connect → link → gas → activate → done", () => {
    expect(at(fresh)).toBe("connect");
    expect(at(fresh, true)).toBe("link");
    const linked = {
      ...fresh,
      walletLinked: true,
      wallet: WALLET,
      balance: "0",
    };
    expect(at(linked, true)).toBe("gas");
    const funded = { ...linked, balance: "5000000000000000", hasGas: true };
    expect(at(funded, true)).toBe("activate");
    expect(at({ ...funded, studentStatus: "pending" }, true)).toBe("activate");
    expect(at({ ...funded, studentStatus: "failed", error: "x" }, true)).toBe(
      "activate",
    );
    expect(
      at({ ...funded, studentStatus: "verified", onchainVerified: true }, true),
    ).toBeNull();
  });

  it("resumes at the right step after a refresh, before MetaMask reconnects", () => {
    // Linked on the server: steps 2 and 3 stay done with no wagmi connection yet.
    const linked = {
      ...fresh,
      walletLinked: true,
      wallet: WALLET,
      balance: "0",
    };
    expect(at(linked, false)).toBe("gas");
    const funded = {
      ...linked,
      hasGas: true,
      studentStatus: "pending" as const,
    };
    expect(at(funded, false)).toBe("activate");
  });

  it("isn't done until the DB row and the chain both say verified", () => {
    const funded = {
      ...fresh,
      walletLinked: true,
      wallet: WALLET,
      hasGas: true,
    };
    expect(
      at({ ...funded, studentStatus: "verified", onchainVerified: false }),
    ).toBe("activate");
    expect(
      at({ ...funded, studentStatus: "pending", onchainVerified: true }),
    ).toBe("activate");
  });

  it("stays done after the student spends their gas", () => {
    const activated = {
      ...fresh,
      walletLinked: true,
      wallet: WALLET,
      studentStatus: "verified" as const,
      onchainVerified: true,
      hasGas: false,
    };
    expect(at(activated)).toBeNull();
  });
});

describe("onboardingStatusSchema", () => {
  it("accepts the API shape and rejects a malformed one", () => {
    expect(onboardingStatusSchema.parse(fresh)).toEqual(fresh);
    expect(
      onboardingStatusSchema.safeParse({ ...fresh, balance: "1.5" }).success,
    ).toBe(false);
    expect(
      onboardingStatusSchema.safeParse({ ...fresh, wallet: "0x12" }).success,
    ).toBe(false);
  });
});
