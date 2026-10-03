// Checks role holders on a deployed LostAndFound against the network's Ignition parameter file
// and fixes them from the deployer account: grants any missing role, then, if `admin` is not
// the deployer, makes sure `admin` holds DEFAULT_ADMIN_ROLE before the deployer renounces it.
// Every step checks first, so the script is safe to re-run.
//
// Usage: pnpm hardhat run scripts/setup-roles.ts --network sepolia
// Pick another deployment with DEPLOYMENT_ID (default: chain-31337 locally, sepolia-v1 on Sepolia).
import { network } from "hardhat";
import {
  isAddressEqual,
  keccak256,
  toHex,
  zeroHash,
  type Address,
  type Hex,
} from "viem";

import { readDeployment, readRoleHolders } from "./lib/deployments.ts";

const DEFAULT_DEPLOYMENT_IDS: Record<number, string> = {
  31337: "chain-31337",
  11155111: "sepolia-v1",
};

const { viem } = await network.create();
const publicClient = await viem.getPublicClient();
const [deployer] = await viem.getWalletClients();

const chainId = await publicClient.getChainId();
const deploymentId =
  process.env.DEPLOYMENT_ID ?? DEFAULT_DEPLOYMENT_IDS[chainId];
if (deploymentId === undefined) {
  throw new Error(
    `No default deployment id for chain ${chainId}; set DEPLOYMENT_ID`,
  );
}
const deployment = await readDeployment(deploymentId);
if (deployment === undefined) {
  throw new Error(
    `Deployment ${deploymentId} not found in ignition/deployments`,
  );
}
if (deployment.chainId !== chainId) {
  throw new Error(
    `Deployment ${deploymentId} is on chain ${deployment.chainId}, connected to chain ${chainId}`,
  );
}

const roles = await readRoleHolders(chainId);
const lostAndFound = await viem.getContractAt(
  "LostAndFound",
  deployment.address,
);
const self = deployer.account.address;

const DEFAULT_ADMIN_ROLE = zeroHash;
const wanted: { name: string; role: Hex; holder: Address }[] = [
  { name: "DEFAULT_ADMIN_ROLE", role: DEFAULT_ADMIN_ROLE, holder: roles.admin },
  {
    name: "VERIFIER_ROLE",
    role: keccak256(toHex("VERIFIER_ROLE")),
    holder: roles.verifier,
  },
  {
    name: "ARBITER_ROLE",
    role: keccak256(toHex("ARBITER_ROLE")),
    holder: roles.arbiter,
  },
];

async function send(label: string, hash: Hex) {
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success")
    throw new Error(`${label} reverted (${hash})`);
  console.log(`${label}: ${hash}`);
}

console.log(
  `LostAndFound ${deployment.address} (${deploymentId}), deployer ${self}`,
);

// 1. Grant any role whose intended holder doesn't have it yet.
for (const { name, role, holder } of wanted) {
  if (await lostAndFound.read.hasRole([role, holder])) continue;
  if (!(await lostAndFound.read.hasRole([DEFAULT_ADMIN_ROLE, self]))) {
    throw new Error(
      `${holder} is missing ${name} and the deployer is not an admin. Grant it from the admin account.`,
    );
  }
  await send(
    `Granted ${name} to ${holder}`,
    await lostAndFound.write.grantRole([role, holder], {
      account: deployer.account,
    }),
  );
}

// 2. Hand admin over: the deployer keeps DEFAULT_ADMIN_ROLE only if it is the intended admin.
if (
  !isAddressEqual(self, roles.admin) &&
  (await lostAndFound.read.hasRole([DEFAULT_ADMIN_ROLE, self]))
) {
  if (!(await lostAndFound.read.hasRole([DEFAULT_ADMIN_ROLE, roles.admin]))) {
    throw new Error(
      `Refusing to renounce: ${roles.admin} does not hold DEFAULT_ADMIN_ROLE`,
    );
  }
  await send(
    "Deployer renounced DEFAULT_ADMIN_ROLE",
    await lostAndFound.write.renounceRole([DEFAULT_ADMIN_ROLE, self], {
      account: deployer.account,
    }),
  );
}

// 3. Report the final state and fail if anything is off.
let ok = true;
for (const { name, role, holder } of wanted) {
  const has = await lostAndFound.read.hasRole([role, holder]);
  ok &&= has;
  console.log(`${has ? "ok  " : "MISSING"} ${name} -> ${holder}`);
}
if (!isAddressEqual(self, roles.admin)) {
  const stillAdmin = await lostAndFound.read.hasRole([
    DEFAULT_ADMIN_ROLE,
    self,
  ]);
  ok &&= !stillAdmin;
  console.log(
    `${stillAdmin ? "EXTRA" : "ok  "} deployer has no DEFAULT_ADMIN_ROLE`,
  );
}
if (!ok) {
  process.exitCode = 1;
}
