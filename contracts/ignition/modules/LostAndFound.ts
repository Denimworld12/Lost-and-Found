import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

/** Defaults from PLAN.md: 0.001 ETH minimum reward, 0.0005 ETH claim stake, 3-day window. */
const DEFAULT_MIN_REWARD = 1_000_000_000_000_000n;
const DEFAULT_CLAIM_STAKE = 500_000_000_000_000n;
const DEFAULT_CONFIRM_WINDOW = 3n * 24n * 60n * 60n;

export default buildModule("LostAndFoundModule", (m) => {
  const admin = m.getParameter<string>("admin");
  const verifier = m.getParameter<string>("verifier");
  const arbiter = m.getParameter<string>("arbiter");
  const minReward = m.getParameter("minReward", DEFAULT_MIN_REWARD);
  const claimStake = m.getParameter("claimStake", DEFAULT_CLAIM_STAKE);
  const confirmWindow = m.getParameter("confirmWindow", DEFAULT_CONFIRM_WINDOW);

  const lostAndFound = m.contract("LostAndFound", [
    admin,
    verifier,
    arbiter,
    minReward,
    claimStake,
    confirmWindow,
  ]);

  return { lostAndFound };
});
