import { parseEther } from "viem";
import { z } from "zod";

// Our CSP forbids eval; without this zod probes `new Function`.
z.config({ jitless: true });

/** Below this balance step 4 asks the student to get test ETH. */
export const MIN_GAS_WEI = parseEther("0.002");

const hexAddress = z.string().regex(/^0x[0-9a-fA-F]{40}$/);
const txHash = z.string().regex(/^0x[0-9a-fA-F]{64}$/);

/** `GET /api/onboarding/status`. Wei amounts are decimal strings. */
export const onboardingStatusSchema = z.object({
  email: z.string().nullable(),
  emailOk: z.boolean(),
  walletLinked: z.boolean(),
  /** More than one verified wallet is linked; the student must remove one. */
  multipleWallets: z.boolean(),
  wallet: hexAddress.nullable(),
  studentStatus: z.enum(["none", "pending", "verified", "failed", "revoked"]),
  onchainVerified: z.boolean(),
  /** Balance of the linked wallet in wei; `null` without a linked wallet. */
  balance: z.string().regex(/^\d+$/).nullable(),
  hasGas: z.boolean(),
  verifyTxHash: txHash.nullable(),
  /** Last verification error, safe to show. */
  error: z.string().nullable(),
});

export type OnboardingStatus = z.infer<typeof onboardingStatusSchema>;

export const STEP_IDS = [
  "college",
  "connect",
  "link",
  "gas",
  "activate",
] as const;
export type StepId = (typeof STEP_IDS)[number];

export interface StepState {
  id: StepId;
  done: boolean;
}

/**
 * Which steps are done, from the server status plus whether MetaMask is connected in this
 * browser. Linking proves control of the wallet, so a linked wallet also completes "connect"
 * (a refresh after linking resumes at step 4 even before wagmi reconnects).
 */
export function deriveSteps(
  status: OnboardingStatus,
  walletConnected: boolean,
): StepState[] {
  const activated =
    status.studentStatus === "verified" && status.onchainVerified;
  const done: Record<StepId, boolean> = {
    college: status.emailOk,
    connect: status.walletLinked || walletConnected,
    link: status.walletLinked,
    // Gas is only checked on the way in; spending it later doesn't undo activation.
    gas: status.hasGas || activated,
    activate: activated,
  };
  return STEP_IDS.map((id) => ({ id, done: done[id] }));
}

/** The first step that isn't done, or `null` when the account is fully set up. */
export function currentStep(steps: StepState[]): StepId | null {
  return steps.find((step) => !step.done)?.id ?? null;
}
