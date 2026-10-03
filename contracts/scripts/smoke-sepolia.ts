// Runs the happy path on a Sepolia deployment with two test student wallets:
// fund (from the deployer) -> verify (verifier) -> post (A) -> claim (B) -> confirm (A) -> withdraw (B).
// Every transaction is simulated first and printed with its hash, so the run can be audited on Etherscan.
//
// Keys come from the keystore: SEPOLIA_PRIVATE_KEY (pays for funding), VERIFIER_PRIVATE_KEY,
// STUDENT_A_PRIVATE_KEY and STUDENT_B_PRIVATE_KEY.
// Usage: pnpm hardhat run scripts/smoke-sepolia.ts
// Pick another deployment with IGNITION_DEPLOYMENT_ID (default sepolia-v1).
import { network } from "hardhat";
import { configVariable } from "hardhat/config";
import {
  formatEther,
  isAddressEqual,
  parseEther,
  type Address,
  type Hash,
} from "viem";

import { readDeployment, readRoleHolders } from "./lib/deployments.ts";

const SEPOLIA_CHAIN_ID = 11155111;

// Placeholder metadata CID; nothing is pinned for it, so the app shows on-chain facts only.
const SMOKE_CID = "bafkreihtny7ve5ohrklxftqiqib3xjq254ak7ljwrvydyomnwgsh32j3xm";

// Each wallet is topped up to this balance when below it (reward/stake plus gas headroom).
const VERIFIER_FLOAT = parseEther("0.002");
const STUDENT_A_FLOAT = parseEther("0.004");
const STUDENT_B_FLOAT = parseEther("0.003");

const { viem } = await network.create({
  network: "sepolia",
  override: {
    accounts: [
      configVariable("SEPOLIA_PRIVATE_KEY"),
      configVariable("VERIFIER_PRIVATE_KEY"),
      configVariable("STUDENT_A_PRIVATE_KEY"),
      configVariable("STUDENT_B_PRIVATE_KEY"),
    ],
  },
});
const publicClient = await viem.getPublicClient();
const [deployer, verifier, studentA, studentB] = await viem.getWalletClients();

const chainId = await publicClient.getChainId();
if (chainId !== SEPOLIA_CHAIN_ID) {
  throw new Error(
    `Expected Sepolia (${SEPOLIA_CHAIN_ID}), got chain ${chainId}`,
  );
}

const deploymentId = process.env.IGNITION_DEPLOYMENT_ID ?? "sepolia-v1";
const deployment = await readDeployment(deploymentId);
if (deployment === undefined || deployment.chainId !== chainId) {
  throw new Error(
    `Sepolia deployment ${deploymentId} not found in ignition/deployments`,
  );
}
const roles = await readRoleHolders(chainId);
if (!isAddressEqual(verifier.account.address, roles.verifier)) {
  throw new Error(
    `VERIFIER_PRIVATE_KEY is ${verifier.account.address}, expected verifier ${roles.verifier}`,
  );
}

const lostAndFound = await viem.getContractAt(
  "LostAndFound",
  deployment.address,
);
const txs: { step: string; hash: Hash }[] = [];

async function confirm(step: string, hash: Hash) {
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success")
    throw new Error(`${step} reverted (${hash})`);
  txs.push({ step, hash });
  console.log(`${step}: ${hash} (block ${receipt.blockNumber})`);
}

console.log(`LostAndFound ${deployment.address} (${deploymentId})`);
console.log(`Student A ${studentA.account.address}`);
console.log(`Student B ${studentB.account.address}`);

// 1. Fund the verifier and both students from the deployer.
for (const [label, wallet, float] of [
  ["verifier", verifier, VERIFIER_FLOAT],
  ["Student A", studentA, STUDENT_A_FLOAT],
  ["Student B", studentB, STUDENT_B_FLOAT],
] as const) {
  const balance = await publicClient.getBalance({
    address: wallet.account.address,
  });
  if (balance >= float) continue;
  await confirm(
    `Fund ${label} ${formatEther(float - balance)} ETH`,
    await deployer.sendTransaction({
      to: wallet.account.address,
      value: float - balance,
    }),
  );
}

// 2. Verify both students.
const unverified: Address[] = [];
for (const wallet of [studentA, studentB]) {
  if (!(await lostAndFound.read.isVerified([wallet.account.address]))) {
    unverified.push(wallet.account.address);
  }
}
if (unverified.length > 0) {
  const { request } = await publicClient.simulateContract({
    address: deployment.address,
    abi: lostAndFound.abi,
    functionName: "verifyStudents",
    args: [unverified],
    account: verifier.account,
  });
  await confirm(
    "Verifier verifyStudents",
    await verifier.writeContract(request),
  );
}

// 3. Student A posts an item with the minimum reward.
const reward = await lostAndFound.read.minReward();
const posted = await publicClient.simulateContract({
  address: deployment.address,
  abi: lostAndFound.abi,
  functionName: "postItem",
  args: [SMOKE_CID],
  value: reward,
  account: studentA.account,
});
const id = posted.result;
await confirm(
  `Student A postItem #${id}`,
  await studentA.writeContract(posted.request),
);

// 4. Student B claims it with the stake.
const stake = await lostAndFound.read.claimStake();
const claimed = await publicClient.simulateContract({
  address: deployment.address,
  abi: lostAndFound.abi,
  functionName: "claimItem",
  args: [id],
  value: stake,
  account: studentB.account,
});
await confirm(
  `Student B claimItem #${id}`,
  await studentB.writeContract(claimed.request),
);

// 5. Student A confirms the return.
const confirmed = await publicClient.simulateContract({
  address: deployment.address,
  abi: lostAndFound.abi,
  functionName: "confirmReturn",
  args: [id],
  account: studentA.account,
});
await confirm(
  `Student A confirmReturn #${id}`,
  await studentA.writeContract(confirmed.request),
);

// 6. Student B withdraws reward + stake.
const credited = await lostAndFound.read.balances([studentB.account.address]);
if (credited !== reward + stake) {
  throw new Error(
    `Student B credited ${credited} wei, expected ${reward + stake}`,
  );
}
const withdrawn = await publicClient.simulateContract({
  address: deployment.address,
  abi: lostAndFound.abi,
  functionName: "withdraw",
  account: studentB.account,
});
await confirm(
  `Student B withdraw ${formatEther(credited)} ETH`,
  await studentB.writeContract(withdrawn.request),
);

const item = await lostAndFound.read.getItem([id]);
const left = await lostAndFound.read.balances([studentB.account.address]);
console.log(
  `Item #${id} status ${item.status} (4 = Completed), Student B balance left ${left}`,
);
if (item.status !== 4 || left !== 0n) process.exitCode = 1;

console.log("\nTransactions:");
for (const { step, hash } of txs) {
  console.log(`- ${step}: https://sepolia.etherscan.io/tx/${hash}`);
}
