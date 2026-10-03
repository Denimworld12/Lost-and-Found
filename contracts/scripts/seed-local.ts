// Seeds a local node: verifies two student accounts and posts three demo items.
// Usage: pnpm hardhat run scripts/seed-local.ts --network localhost
import { network } from "hardhat";
import { formatEther, isAddressEqual, parseEther } from "viem";

import { readDeployment, readRoleHolders } from "./lib/deployments.ts";

const LOCAL_CHAIN_ID = 31337;

// Placeholder metadata CIDs; nothing is pinned for them, so the app shows on-chain facts only.
const DEMO_ITEMS = [
  {
    student: 0,
    cid: "bafkreihtny7ve5ohrklxftqiqib3xjq254ak7ljwrvydyomnwgsh32j3xm",
    reward: parseEther("0.01"),
  },
  {
    student: 0,
    cid: "bafkreifwnd7bpyn5bdqecgfv5rc2bp5cgfaimgnwi667hbtig6v3lmrtpi",
    reward: parseEther("0.005"),
  },
  {
    student: 1,
    cid: "bafkreigpktr7qyvn3jf3enf5bskkz6jxual7mtq6kdno2ix5bnfzsi7g6i",
    reward: parseEther("0.02"),
  },
] as const;

const { viem } = await network.create();
const publicClient = await viem.getPublicClient();

const chainId = await publicClient.getChainId();
if (chainId !== LOCAL_CHAIN_ID) {
  throw new Error(
    `seed-local only runs on the local node (chain ${LOCAL_CHAIN_ID}), not chain ${chainId}`,
  );
}

const deployment = await readDeployment(`chain-${LOCAL_CHAIN_ID}`);
if (deployment === undefined) {
  throw new Error(
    "No local deployment found. Run `pnpm --filter contracts deploy:local` first.",
  );
}
const code = await publicClient.getCode({ address: deployment.address });
if (code === undefined) {
  throw new Error(
    `No contract at ${deployment.address}. The local node restarted; redeploy with \`pnpm --filter contracts deploy:local --reset\`.`,
  );
}

const roles = await readRoleHolders(LOCAL_CHAIN_ID);
const wallets = await viem.getWalletClients();
const verifier = wallets.find((w) =>
  isAddressEqual(w.account.address, roles.verifier),
);
if (verifier === undefined) {
  throw new Error(`Verifier ${roles.verifier} is not a local node account`);
}
// Accounts #3 and #4: not admin, verifier or arbiter.
const students = [wallets[3], wallets[4]];

const lostAndFound = await viem.getContractAt(
  "LostAndFound",
  deployment.address,
);

for (const student of students) {
  const address = student.account.address;
  if (await lostAndFound.read.isVerified([address])) {
    console.log(`Student ${address} already verified`);
    continue;
  }
  const hash = await lostAndFound.write.verifyStudent([address], {
    account: verifier.account,
  });
  await publicClient.waitForTransactionReceipt({ hash });
  console.log(`Verified student ${address}`);
}

if ((await lostAndFound.read.itemCount()) > 0n) {
  console.log("Items already posted; skipping demo items");
} else {
  for (const item of DEMO_ITEMS) {
    const owner = students[item.student];
    const hash = await lostAndFound.write.postItem([item.cid], {
      account: owner.account,
      value: item.reward,
    });
    await publicClient.waitForTransactionReceipt({ hash });
    console.log(
      `Posted item for ${owner.account.address} with ${formatEther(item.reward)} ETH reward`,
    );
  }
}

console.log(
  `LostAndFound ${deployment.address}: ${await lostAndFound.read.itemCount()} item(s)`,
);
