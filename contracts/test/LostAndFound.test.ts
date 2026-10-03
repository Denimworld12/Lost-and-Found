import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { network } from "hardhat";
import {
  decodeErrorResult,
  encodeFunctionData,
  getAddress,
  keccak256,
  maxUint128,
  parseEther,
  toFunctionSelector,
  toHex,
  zeroAddress,
  type Address,
} from "viem";

const { viem, networkHelpers } = await network.create();
const publicClient = await viem.getPublicClient();

const MIN_REWARD = parseEther("0.001");
const STAKE = parseEther("0.0005");
const WINDOW = 3n * 24n * 60n * 60n; // 3 days
const MIN_WINDOW = 5n * 60n;
const MAX_WINDOW = 14n * 24n * 60n * 60n;
const REWARD = parseEther("0.01");
const CID = "bafkreigh2akiscaildcqabsyg3dfr6chu3fgpregiymsck7e7aqa4s52zy";

const VERIFIER_ROLE = keccak256(toHex("VERIFIER_ROLE"));
const ARBITER_ROLE = keccak256(toHex("ARBITER_ROLE"));
const DEFAULT_ADMIN_ROLE = `0x${"00".repeat(32)}` as const;

const Status = {
  None: 0,
  Open: 1,
  Claimed: 2,
  Disputed: 3,
  Completed: 4,
  Cancelled: 5,
} as const;

// ─────────────────────────────────────────────────────────────── Fixtures

async function deployFixture() {
  const [admin, verifier, arbiter, alice, bob, carol, mallory] =
    await viem.getWalletClients();
  const lf = await viem.deployContract("LostAndFound", [
    admin.account.address,
    verifier.account.address,
    arbiter.account.address,
    MIN_REWARD,
    STAKE,
    WINDOW,
  ]);
  await lf.write.verifyStudents(
    [[alice.account.address, bob.account.address, carol.account.address]],
    { account: verifier.account },
  );
  return { lf, admin, verifier, arbiter, alice, bob, carol, mallory };
}

/** Alice (owner) has posted item 1 with REWARD. */
async function postedFixture() {
  const f = await deployFixture();
  await f.lf.write.postItem([CID], {
    account: f.alice.account,
    value: REWARD,
  });
  return f;
}

/** Bob (finder) has claimed item 1. */
async function claimedFixture() {
  const f = await postedFixture();
  await f.lf.write.claimItem([1n], { account: f.bob.account, value: STAKE });
  const item = await f.lf.read.getItem([1n]);
  return { ...f, claimedAt: item.claimedAt };
}

/** Alice has disputed Bob's claim on item 1. */
async function disputedFixture() {
  const f = await claimedFixture();
  await f.lf.write.raiseDispute([1n], { account: f.alice.account });
  return f;
}

type Fixture = Awaited<ReturnType<typeof deployFixture>>;
let current: Fixture | undefined;

async function setup<T extends Fixture>(fixture: () => Promise<T>): Promise<T> {
  const f = await networkHelpers.loadFixture(fixture);
  current = f;
  return f;
}

/** Contract ETH must always cover everything it owes. */
async function assertSolvent(lf: Fixture["lf"]) {
  const balance = await publicClient.getBalance({ address: lf.address });
  const escrowed = await lf.read.totalEscrowed();
  const credited = await lf.read.totalCredited();
  assert.ok(
    balance >= escrowed + credited,
    `insolvent: balance ${balance} < escrowed ${escrowed} + credited ${credited}`,
  );
}

/** Walks a viem error chain for revert data and decodes it with the contract ABI. */
function revertErrorName(error: unknown, abi: Fixture["lf"]["abi"]): string {
  let e: unknown = error;
  while (e !== undefined && e !== null) {
    const data = (e as { data?: unknown }).data;
    if (
      typeof data === "string" &&
      data.startsWith("0x") &&
      data.length >= 10
    ) {
      return decodeErrorResult({ abi, data: data as `0x${string}` }).errorName;
    }
    if (typeof data === "object" && data !== null && "errorName" in data) {
      return String((data as { errorName: unknown }).errorName);
    }
    e = (e as { cause?: unknown }).cause;
  }
  throw new Error(`no revert data in error: ${String(error)}`);
}

async function expectDeployRevert(
  args: readonly [Address, Address, Address, bigint, bigint, bigint],
  errorName: string,
) {
  const { lf } = await setup(deployFixture);
  await assert.rejects(
    viem.deployContract("LostAndFound", [...args]),
    (err) => {
      assert.equal(revertErrorName(err, lf.abi), errorName);
      return true;
    },
  );
}

// ─────────────────────────────────────────────────────────────── Tests

describe("LostAndFound", () => {
  afterEach(async () => {
    if (current) await assertSolvent(current.lf);
    current = undefined;
  });

  describe("deployment", () => {
    it("assigns the three roles", async () => {
      const { lf, admin, verifier, arbiter, alice } =
        await setup(deployFixture);
      assert.equal(
        await lf.read.hasRole([DEFAULT_ADMIN_ROLE, admin.account.address]),
        true,
      );
      assert.equal(
        await lf.read.hasRole([VERIFIER_ROLE, verifier.account.address]),
        true,
      );
      assert.equal(
        await lf.read.hasRole([ARBITER_ROLE, arbiter.account.address]),
        true,
      );
      assert.equal(await lf.read.VERIFIER_ROLE(), VERIFIER_ROLE);
      assert.equal(await lf.read.ARBITER_ROLE(), ARBITER_ROLE);
      assert.equal(
        await lf.read.hasRole([DEFAULT_ADMIN_ROLE, alice.account.address]),
        false,
      );
    });

    it("sets the config and starts empty", async () => {
      const { lf } = await setup(deployFixture);
      assert.equal(await lf.read.minReward(), MIN_REWARD);
      assert.equal(await lf.read.claimStake(), STAKE);
      assert.equal(await lf.read.confirmWindow(), WINDOW);
      assert.equal(await lf.read.MIN_CONFIRM_WINDOW(), MIN_WINDOW);
      assert.equal(await lf.read.MAX_CONFIRM_WINDOW(), MAX_WINDOW);
      assert.equal(await lf.read.MAX_CID_LENGTH(), 100n);
      assert.equal(await lf.read.itemCount(), 0n);
      assert.equal(await lf.read.totalEscrowed(), 0n);
      assert.equal(await lf.read.totalCredited(), 0n);
      assert.equal(await lf.read.paused(), false);
    });

    it("emits ConfigUpdated on deploy", async () => {
      const { lf } = await setup(deployFixture);
      const events = await lf.getEvents.ConfigUpdated({ fromBlock: 0n });
      assert.equal(events.length, 1);
      assert.deepEqual(events[0].args, {
        minReward: MIN_REWARD,
        claimStake: STAKE,
        confirmWindow: WINDOW,
      });
    });

    it("reverts on zero addresses", async () => {
      const [a] = await viem.getWalletClients();
      const ok = a.account.address;
      const w = WINDOW;
      await expectDeployRevert(
        [zeroAddress, ok, ok, MIN_REWARD, STAKE, w],
        "ZeroAddress",
      );
      await expectDeployRevert(
        [ok, zeroAddress, ok, MIN_REWARD, STAKE, w],
        "ZeroAddress",
      );
      await expectDeployRevert(
        [ok, ok, zeroAddress, MIN_REWARD, STAKE, w],
        "ZeroAddress",
      );
    });

    it("reverts on bad config", async () => {
      const [a] = await viem.getWalletClients();
      const ok = a.account.address;
      const w = WINDOW;
      const cases: Array<[bigint, bigint, bigint]> = [
        [0n, STAKE, w],
        [maxUint128 + 1n, STAKE, w],
        [MIN_REWARD, 0n, w],
        [MIN_REWARD, maxUint128 + 1n, w],
        [MIN_REWARD, STAKE, MIN_WINDOW - 1n],
        [MIN_REWARD, STAKE, MAX_WINDOW + 1n],
      ];
      for (const [minReward, stake, window] of cases) {
        await expectDeployRevert(
          [ok, ok, ok, minReward, stake, window],
          "InvalidConfig",
        );
      }
    });

    it("accepts config exactly at the bounds", async () => {
      const [a] = await viem.getWalletClients();
      const ok = a.account.address;
      current = undefined;
      for (const window of [MIN_WINDOW, MAX_WINDOW]) {
        const lf = await viem.deployContract("LostAndFound", [
          ok,
          ok,
          ok,
          maxUint128,
          maxUint128,
          window,
        ]);
        assert.equal(await lf.read.confirmWindow(), window);
        assert.equal(await lf.read.minReward(), maxUint128);
      }
    });
  });

  describe("student verification", () => {
    it("verifier verifies one student and emits StudentVerified", async () => {
      const { lf, verifier, mallory } = await setup(deployFixture);
      await viem.assertions.emitWithArgs(
        lf.write.verifyStudent([mallory.account.address], {
          account: verifier.account,
        }),
        lf,
        "StudentVerified",
        [getAddress(mallory.account.address)],
      );
      assert.equal(await lf.read.isVerified([mallory.account.address]), true);
    });

    it("verifier verifies a batch, one event each", async () => {
      const { lf, verifier, alice, bob, carol } = await setup(deployFixture);
      assert.equal(await lf.read.isVerified([alice.account.address]), true);
      assert.equal(await lf.read.isVerified([bob.account.address]), true);
      assert.equal(await lf.read.isVerified([carol.account.address]), true);
      const events = await lf.getEvents.StudentVerified({}, { fromBlock: 0n });
      assert.deepEqual(
        events.map((e) => e.args.student),
        [alice, bob, carol].map((w) => getAddress(w.account.address)),
      );
      // An empty batch is a no-op.
      await lf.write.verifyStudents([[]], { account: verifier.account });
    });

    it("rejects the zero address, alone or in a batch", async () => {
      const { lf, verifier, mallory } = await setup(deployFixture);
      await viem.assertions.revertWithCustomError(
        lf.write.verifyStudent([zeroAddress], { account: verifier.account }),
        lf,
        "ZeroAddress",
      );
      await viem.assertions.revertWithCustomError(
        lf.write.verifyStudents([[mallory.account.address, zeroAddress]], {
          account: verifier.account,
        }),
        lf,
        "ZeroAddress",
      );
      assert.equal(await lf.read.isVerified([mallory.account.address]), false);
    });

    it("only the verifier can verify or revoke", async () => {
      const { lf, admin, alice, mallory } = await setup(deployFixture);
      for (const caller of [admin, alice, mallory]) {
        await viem.assertions.revertWithCustomErrorWithArgs(
          lf.write.verifyStudent([mallory.account.address], {
            account: caller.account,
          }),
          lf,
          "AccessControlUnauthorizedAccount",
          [getAddress(caller.account.address), VERIFIER_ROLE],
        );
        await viem.assertions.revertWithCustomError(
          lf.write.verifyStudents([[mallory.account.address]], {
            account: caller.account,
          }),
          lf,
          "AccessControlUnauthorizedAccount",
        );
        await viem.assertions.revertWithCustomError(
          lf.write.revokeStudent([alice.account.address], {
            account: caller.account,
          }),
          lf,
          "AccessControlUnauthorizedAccount",
        );
      }
    });

    it("verifier revokes a student and emits StudentRevoked", async () => {
      const { lf, verifier, alice } = await setup(deployFixture);
      await viem.assertions.emitWithArgs(
        lf.write.revokeStudent([alice.account.address], {
          account: verifier.account,
        }),
        lf,
        "StudentRevoked",
        [getAddress(alice.account.address)],
      );
      assert.equal(await lf.read.isVerified([alice.account.address]), false);
      await viem.assertions.revertWithCustomError(
        lf.write.postItem([CID], { account: alice.account, value: REWARD }),
        lf,
        "NotVerified",
      );
    });
  });

  describe("postItem", () => {
    it("reverts for unverified callers", async () => {
      const { lf, mallory } = await setup(deployFixture);
      await viem.assertions.revertWithCustomError(
        lf.write.postItem([CID], { account: mallory.account, value: REWARD }),
        lf,
        "NotVerified",
      );
    });

    it("reverts while paused", async () => {
      const { lf, admin, alice } = await setup(deployFixture);
      await lf.write.pause({ account: admin.account });
      await viem.assertions.revertWithCustomError(
        lf.write.postItem([CID], { account: alice.account, value: REWARD }),
        lf,
        "EnforcedPause",
      );
    });

    it("reverts when the reward is below minReward", async () => {
      const { lf, alice } = await setup(deployFixture);
      await viem.assertions.revertWithCustomError(
        lf.write.postItem([CID], {
          account: alice.account,
          value: MIN_REWARD - 1n,
        }),
        lf,
        "RewardTooLow",
      );
      await viem.assertions.revertWithCustomError(
        lf.write.postItem([CID], { account: alice.account }),
        lf,
        "RewardTooLow",
      );
    });

    it("accepts a reward exactly at minReward", async () => {
      const { lf, alice } = await setup(deployFixture);
      await lf.write.postItem([CID], {
        account: alice.account,
        value: MIN_REWARD,
      });
      assert.equal((await lf.read.getItem([1n])).reward, MIN_REWARD);
    });

    it("reverts when the reward does not fit in uint128", async () => {
      const { lf, alice } = await setup(deployFixture);
      await networkHelpers.setBalance(alice.account.address, maxUint128 * 4n);
      await viem.assertions.revertWithCustomError(
        lf.write.postItem([CID], {
          account: alice.account,
          value: maxUint128 + 1n,
        }),
        lf,
        "RewardTooHigh",
      );
    });

    it("rejects an empty or 101-byte CID and accepts 100 bytes", async () => {
      const { lf, alice } = await setup(deployFixture);
      for (const cid of ["", "a".repeat(101)]) {
        await viem.assertions.revertWithCustomError(
          lf.write.postItem([cid], { account: alice.account, value: REWARD }),
          lf,
          "InvalidCID",
        );
      }
      await lf.write.postItem(["a".repeat(100)], {
        account: alice.account,
        value: REWARD,
      });
      await lf.write.postItem(["a"], { account: alice.account, value: REWARD });
      assert.equal(await lf.read.itemCount(), 2n);
    });

    it("creates an Open item, increments IDs and escrows the reward", async () => {
      const { lf, alice, bob } = await setup(deployFixture);
      await viem.assertions.emitWithArgs(
        lf.write.postItem([CID], { account: alice.account, value: REWARD }),
        lf,
        "ItemPosted",
        [1n, getAddress(alice.account.address), REWARD, CID],
      );
      const before = await networkHelpers.time.latest();
      await viem.assertions.emitWithArgs(
        lf.write.postItem(["cid-2"], {
          account: bob.account,
          value: MIN_REWARD,
        }),
        lf,
        "ItemPosted",
        [2n, getAddress(bob.account.address), MIN_REWARD, "cid-2"],
      );
      assert.equal(await lf.read.itemCount(), 2n);
      assert.equal(await lf.read.totalEscrowed(), REWARD + MIN_REWARD);
      assert.equal(
        await publicClient.getBalance({ address: lf.address }),
        REWARD + MIN_REWARD,
      );

      const item = await lf.read.getItem([2n]);
      assert.equal(getAddress(item.owner), getAddress(bob.account.address));
      assert.equal(item.status, Status.Open);
      assert.ok(item.createdAt > BigInt(before));
      assert.equal(item.finder, zeroAddress);
      assert.equal(item.claimedAt, 0n);
      assert.equal(item.claimWindow, 0);
      assert.equal(item.reward, MIN_REWARD);
      assert.equal(item.stake, 0n);
      assert.equal(item.metadataCID, "cid-2");
    });
  });

  describe("claimItem", () => {
    it("claims an Open item, locks the deposit and emits ItemClaimed", async () => {
      const { lf, bob } = await setup(postedFixture);
      await viem.assertions.emitWithArgs(
        lf.write.claimItem([1n], { account: bob.account, value: STAKE }),
        lf,
        "ItemClaimed",
        [1n, getAddress(bob.account.address), STAKE],
      );
      const item = await lf.read.getItem([1n]);
      assert.equal(item.status, Status.Claimed);
      assert.equal(getAddress(item.finder), getAddress(bob.account.address));
      assert.equal(item.stake, STAKE);
      assert.equal(item.claimedAt, BigInt(await networkHelpers.time.latest()));
      assert.equal(BigInt(item.claimWindow), WINDOW);
      assert.equal(await lf.read.totalEscrowed(), REWARD + STAKE);
    });

    it("reverts for an unknown item", async () => {
      const { lf, bob } = await setup(postedFixture);
      await viem.assertions.revertWithCustomError(
        lf.write.claimItem([2n], { account: bob.account, value: STAKE }),
        lf,
        "ItemNotFound",
      );
    });

    it("reverts when the item is not Open", async () => {
      const { lf, carol } = await setup(claimedFixture);
      await viem.assertions.revertWithCustomErrorWithArgs(
        lf.write.claimItem([1n], { account: carol.account, value: STAKE }),
        lf,
        "WrongStatus",
        [Status.Open, Status.Claimed],
      );
    });

    it("reverts when the owner claims their own item", async () => {
      const { lf, alice } = await setup(postedFixture);
      await viem.assertions.revertWithCustomError(
        lf.write.claimItem([1n], { account: alice.account, value: STAKE }),
        lf,
        "OwnerCannotClaim",
      );
    });

    it("reverts on the wrong deposit", async () => {
      const { lf, bob } = await setup(postedFixture);
      for (const value of [0n, STAKE - 1n, STAKE + 1n]) {
        await viem.assertions.revertWithCustomError(
          lf.write.claimItem([1n], { account: bob.account, value }),
          lf,
          "WrongStake",
        );
      }
    });

    it("reverts while paused", async () => {
      const { lf, admin, bob } = await setup(postedFixture);
      await lf.write.pause({ account: admin.account });
      await viem.assertions.revertWithCustomError(
        lf.write.claimItem([1n], { account: bob.account, value: STAKE }),
        lf,
        "EnforcedPause",
      );
    });

    it("reverts for unverified callers", async () => {
      const { lf, mallory } = await setup(postedFixture);
      await viem.assertions.revertWithCustomError(
        lf.write.claimItem([1n], { account: mallory.account, value: STAKE }),
        lf,
        "NotVerified",
      );
    });
  });

  describe("confirmReturn", () => {
    it("only the owner can confirm", async () => {
      const { lf, bob, carol } = await setup(claimedFixture);
      for (const caller of [bob, carol]) {
        await viem.assertions.revertWithCustomError(
          lf.write.confirmReturn([1n], { account: caller.account }),
          lf,
          "NotOwner",
        );
      }
    });

    it("only works on Claimed items", async () => {
      const { lf, alice } = await setup(postedFixture);
      await viem.assertions.revertWithCustomErrorWithArgs(
        lf.write.confirmReturn([1n], { account: alice.account }),
        lf,
        "WrongStatus",
        [Status.Claimed, Status.Open],
      );
    });

    it("reverts for an unknown item", async () => {
      const { lf, alice } = await setup(postedFixture);
      await viem.assertions.revertWithCustomError(
        lf.write.confirmReturn([9n], { account: alice.account }),
        lf,
        "ItemNotFound",
      );
    });

    it("completes the item and credits the finder reward + deposit", async () => {
      const { lf, alice, bob } = await setup(claimedFixture);
      await viem.assertions.emitWithArgs(
        lf.write.confirmReturn([1n], { account: alice.account }),
        lf,
        "ReturnConfirmed",
        [1n, getAddress(bob.account.address), REWARD + STAKE],
      );
      assert.equal((await lf.read.getItem([1n])).status, Status.Completed);
      assert.equal(
        await lf.read.balances([bob.account.address]),
        REWARD + STAKE,
      );
      assert.equal(await lf.read.balances([alice.account.address]), 0n);
      assert.equal(await lf.read.totalEscrowed(), 0n);
      assert.equal(await lf.read.totalCredited(), REWARD + STAKE);
    });

    it("still works after the confirm window has passed", async () => {
      const { lf, alice, bob } = await setup(claimedFixture);
      await networkHelpers.time.increase(WINDOW + 1n);
      await lf.write.confirmReturn([1n], { account: alice.account });
      assert.equal(
        await lf.read.balances([bob.account.address]),
        REWARD + STAKE,
      );
    });
  });

  describe("rejectClaim", () => {
    it("only the owner can reject", async () => {
      const { lf, bob, carol } = await setup(claimedFixture);
      for (const caller of [bob, carol]) {
        await viem.assertions.revertWithCustomError(
          lf.write.rejectClaim([1n], { account: caller.account }),
          lf,
          "NotOwner",
        );
      }
    });

    it("only works on Claimed items", async () => {
      const { lf, alice } = await setup(postedFixture);
      await viem.assertions.revertWithCustomErrorWithArgs(
        lf.write.rejectClaim([1n], { account: alice.account }),
        lf,
        "WrongStatus",
        [Status.Claimed, Status.Open],
      );
    });

    it("reverts once the window has closed", async () => {
      const { lf, alice, claimedAt } = await setup(claimedFixture);
      await networkHelpers.time.setNextBlockTimestamp(claimedAt + WINDOW + 1n);
      await viem.assertions.revertWithCustomError(
        lf.write.rejectClaim([1n], { account: alice.account }),
        lf,
        "WindowClosed",
      );
    });

    it("still works exactly at the window edge", async () => {
      const { lf, alice, claimedAt } = await setup(claimedFixture);
      await networkHelpers.time.setNextBlockTimestamp(claimedAt + WINDOW);
      await lf.write.rejectClaim([1n], { account: alice.account });
      assert.equal((await lf.read.getItem([1n])).status, Status.Open);
    });

    it("credits the deposit to the owner and reopens the item", async () => {
      const { lf, alice, bob } = await setup(claimedFixture);
      await viem.assertions.emitWithArgs(
        lf.write.rejectClaim([1n], { account: alice.account }),
        lf,
        "ClaimRejected",
        [1n, getAddress(bob.account.address), STAKE],
      );
      const item = await lf.read.getItem([1n]);
      assert.equal(item.status, Status.Open);
      assert.equal(item.finder, zeroAddress);
      assert.equal(item.stake, 0n);
      assert.equal(item.claimedAt, 0n);
      assert.equal(item.claimWindow, 0);
      assert.equal(item.reward, REWARD);
      assert.equal(await lf.read.balances([alice.account.address]), STAKE);
      assert.equal(await lf.read.balances([bob.account.address]), 0n);
      assert.equal(await lf.read.totalEscrowed(), REWARD);
      assert.equal(await lf.read.totalCredited(), STAKE);
    });

    it("lets a second finder claim after a rejection", async () => {
      const { lf, alice, carol } = await setup(claimedFixture);
      await lf.write.rejectClaim([1n], { account: alice.account });
      await lf.write.claimItem([1n], { account: carol.account, value: STAKE });
      const item = await lf.read.getItem([1n]);
      assert.equal(item.status, Status.Claimed);
      assert.equal(getAddress(item.finder), getAddress(carol.account.address));
      await lf.write.confirmReturn([1n], { account: alice.account });
      assert.equal(
        await lf.read.balances([carol.account.address]),
        REWARD + STAKE,
      );
    });
  });

  describe("raiseDispute", () => {
    it("the owner can dispute", async () => {
      const { lf, alice } = await setup(claimedFixture);
      await viem.assertions.emitWithArgs(
        lf.write.raiseDispute([1n], { account: alice.account }),
        lf,
        "DisputeRaised",
        [1n, getAddress(alice.account.address)],
      );
      assert.equal((await lf.read.getItem([1n])).status, Status.Disputed);
    });

    it("the finder can dispute", async () => {
      const { lf, bob } = await setup(claimedFixture);
      await viem.assertions.emitWithArgs(
        lf.write.raiseDispute([1n], { account: bob.account }),
        lf,
        "DisputeRaised",
        [1n, getAddress(bob.account.address)],
      );
      assert.equal((await lf.read.getItem([1n])).status, Status.Disputed);
    });

    it("anyone else reverts", async () => {
      const { lf, carol, arbiter } = await setup(claimedFixture);
      for (const caller of [carol, arbiter]) {
        await viem.assertions.revertWithCustomError(
          lf.write.raiseDispute([1n], { account: caller.account }),
          lf,
          "NotParty",
        );
      }
    });

    it("only works on Claimed items", async () => {
      const { lf, alice } = await setup(disputedFixture);
      await viem.assertions.revertWithCustomErrorWithArgs(
        lf.write.raiseDispute([1n], { account: alice.account }),
        lf,
        "WrongStatus",
        [Status.Claimed, Status.Disputed],
      );
    });

    it("reverts once the window has closed", async () => {
      const { lf, alice, bob, claimedAt } = await setup(claimedFixture);
      await networkHelpers.time.setNextBlockTimestamp(claimedAt + WINDOW + 1n);
      for (const caller of [alice, bob]) {
        await viem.assertions.revertWithCustomError(
          lf.write.raiseDispute([1n], { account: caller.account }),
          lf,
          "WindowClosed",
        );
      }
    });

    it("reverts for an unknown item", async () => {
      const { lf, alice } = await setup(claimedFixture);
      await viem.assertions.revertWithCustomError(
        lf.write.raiseDispute([2n], { account: alice.account }),
        lf,
        "ItemNotFound",
      );
    });
  });

  describe("claimAfterTimeout", () => {
    it("reverts before the window ends", async () => {
      const { lf, bob } = await setup(claimedFixture);
      await viem.assertions.revertWithCustomError(
        lf.write.claimAfterTimeout([1n], { account: bob.account }),
        lf,
        "WindowOpen",
      );
    });

    it("still reverts exactly at the boundary", async () => {
      const { lf, bob, claimedAt } = await setup(claimedFixture);
      await networkHelpers.time.setNextBlockTimestamp(claimedAt + WINDOW);
      await viem.assertions.revertWithCustomError(
        lf.write.claimAfterTimeout([1n], { account: bob.account }),
        lf,
        "WindowOpen",
      );
    });

    it("pays the finder one second after the window", async () => {
      const { lf, bob, claimedAt } = await setup(claimedFixture);
      await networkHelpers.time.setNextBlockTimestamp(claimedAt + WINDOW + 1n);
      await viem.assertions.emitWithArgs(
        lf.write.claimAfterTimeout([1n], { account: bob.account }),
        lf,
        "TimeoutClaimed",
        [1n, getAddress(bob.account.address), REWARD + STAKE],
      );
      assert.equal((await lf.read.getItem([1n])).status, Status.Completed);
      assert.equal(
        await lf.read.balances([bob.account.address]),
        REWARD + STAKE,
      );
      assert.equal(await lf.read.totalEscrowed(), 0n);
    });

    it("only the finder can collect", async () => {
      const { lf, alice, carol } = await setup(claimedFixture);
      await networkHelpers.time.increase(WINDOW + 1n);
      for (const caller of [alice, carol]) {
        await viem.assertions.revertWithCustomError(
          lf.write.claimAfterTimeout([1n], { account: caller.account }),
          lf,
          "NotFinder",
        );
      }
    });

    it("only works on Claimed items", async () => {
      const { lf, bob } = await setup(disputedFixture);
      await networkHelpers.time.increase(WINDOW + 1n);
      await viem.assertions.revertWithCustomErrorWithArgs(
        lf.write.claimAfterTimeout([1n], { account: bob.account }),
        lf,
        "WrongStatus",
        [Status.Claimed, Status.Disputed],
      );
    });

    it("reverts for an unknown item", async () => {
      const { lf, bob } = await setup(claimedFixture);
      await viem.assertions.revertWithCustomError(
        lf.write.claimAfterTimeout([3n], { account: bob.account }),
        lf,
        "ItemNotFound",
      );
    });
  });

  describe("resolveDispute", () => {
    it("only the arbiter can resolve", async () => {
      const { lf, admin, alice, bob } = await setup(disputedFixture);
      for (const caller of [admin, alice, bob]) {
        await viem.assertions.revertWithCustomErrorWithArgs(
          lf.write.resolveDispute([1n, true], { account: caller.account }),
          lf,
          "AccessControlUnauthorizedAccount",
          [getAddress(caller.account.address), ARBITER_ROLE],
        );
      }
    });

    it("only works on Disputed items", async () => {
      const { lf, arbiter } = await setup(claimedFixture);
      await viem.assertions.revertWithCustomErrorWithArgs(
        lf.write.resolveDispute([1n, true], { account: arbiter.account }),
        lf,
        "WrongStatus",
        [Status.Disputed, Status.Claimed],
      );
    });

    it("reverts for an unknown item", async () => {
      const { lf, arbiter } = await setup(disputedFixture);
      await viem.assertions.revertWithCustomError(
        lf.write.resolveDispute([5n, true], { account: arbiter.account }),
        lf,
        "ItemNotFound",
      );
    });

    it("finder wins: item completes and the finder gets reward + deposit", async () => {
      const { lf, arbiter, alice, bob } = await setup(disputedFixture);
      await viem.assertions.emitWithArgs(
        lf.write.resolveDispute([1n, true], { account: arbiter.account }),
        lf,
        "DisputeResolved",
        [1n, true, getAddress(arbiter.account.address)],
      );
      assert.equal((await lf.read.getItem([1n])).status, Status.Completed);
      assert.equal(
        await lf.read.balances([bob.account.address]),
        REWARD + STAKE,
      );
      assert.equal(await lf.read.balances([alice.account.address]), 0n);
      assert.equal(await lf.read.totalEscrowed(), 0n);
    });

    it("owner wins: owner gets the deposit and the item reopens", async () => {
      const { lf, arbiter, alice, bob, carol } = await setup(disputedFixture);
      await viem.assertions.emitWithArgs(
        lf.write.resolveDispute([1n, false], { account: arbiter.account }),
        lf,
        "DisputeResolved",
        [1n, false, getAddress(arbiter.account.address)],
      );
      const item = await lf.read.getItem([1n]);
      assert.equal(item.status, Status.Open);
      assert.equal(item.finder, zeroAddress);
      assert.equal(item.stake, 0n);
      assert.equal(item.claimedAt, 0n);
      assert.equal(item.claimWindow, 0);
      assert.equal(item.reward, REWARD);
      assert.equal(await lf.read.balances([alice.account.address]), STAKE);
      assert.equal(await lf.read.balances([bob.account.address]), 0n);
      assert.equal(await lf.read.totalEscrowed(), REWARD);

      // The reopened item can be claimed again.
      await lf.write.claimItem([1n], { account: carol.account, value: STAKE });
      assert.equal((await lf.read.getItem([1n])).status, Status.Claimed);
    });
  });

  describe("cancelItem", () => {
    it("only the owner can cancel", async () => {
      const { lf, bob } = await setup(postedFixture);
      await viem.assertions.revertWithCustomError(
        lf.write.cancelItem([1n], { account: bob.account }),
        lf,
        "NotOwner",
      );
    });

    it("only works on Open items", async () => {
      const { lf, alice } = await setup(claimedFixture);
      await viem.assertions.revertWithCustomErrorWithArgs(
        lf.write.cancelItem([1n], { account: alice.account }),
        lf,
        "WrongStatus",
        [Status.Open, Status.Claimed],
      );
    });

    it("reverts for an unknown item", async () => {
      const { lf, alice } = await setup(postedFixture);
      await viem.assertions.revertWithCustomError(
        lf.write.cancelItem([0n], { account: alice.account }),
        lf,
        "ItemNotFound",
      );
    });

    it("cancels and credits the reward to the owner", async () => {
      const { lf, alice } = await setup(postedFixture);
      await viem.assertions.emitWithArgs(
        lf.write.cancelItem([1n], { account: alice.account }),
        lf,
        "ItemCancelled",
        [1n],
      );
      assert.equal((await lf.read.getItem([1n])).status, Status.Cancelled);
      assert.equal(await lf.read.balances([alice.account.address]), REWARD);
      assert.equal(await lf.read.totalEscrowed(), 0n);
      assert.equal(await lf.read.totalCredited(), REWARD);
    });

    it("works while paused", async () => {
      const { lf, admin, alice } = await setup(postedFixture);
      await lf.write.pause({ account: admin.account });
      await lf.write.cancelItem([1n], { account: alice.account });
      await lf.write.withdraw({ account: alice.account });
      assert.equal(await lf.read.balances([alice.account.address]), 0n);
    });
  });

  describe("withdraw", () => {
    it("reverts with nothing to withdraw", async () => {
      const { lf, bob } = await setup(claimedFixture);
      await viem.assertions.revertWithCustomError(
        lf.write.withdraw({ account: bob.account }),
        lf,
        "NothingToWithdraw",
      );
    });

    it("sends the whole balance and zeroes it", async () => {
      const { lf, alice, bob } = await setup(claimedFixture);
      await lf.write.confirmReturn([1n], { account: alice.account });
      const hash = lf.write.withdraw({ account: bob.account });
      await viem.assertions.balancesHaveChanged(hash, [
        { address: bob.account.address, amount: REWARD + STAKE },
        { address: lf.address, amount: -(REWARD + STAKE) },
      ]);
      assert.equal(await lf.read.balances([bob.account.address]), 0n);
      assert.equal(await lf.read.totalCredited(), 0n);
      assert.equal(await publicClient.getBalance({ address: lf.address }), 0n);
      await viem.assertions.revertWithCustomError(
        lf.write.withdraw({ account: bob.account }),
        lf,
        "NothingToWithdraw",
      );
    });

    it("emits Withdrawn", async () => {
      const { lf, alice } = await setup(postedFixture);
      await lf.write.cancelItem([1n], { account: alice.account });
      await viem.assertions.emitWithArgs(
        lf.write.withdraw({ account: alice.account }),
        lf,
        "Withdrawn",
        [getAddress(alice.account.address), REWARD],
      );
    });

    async function reenterFixture() {
      const f = await deployFixture();
      const attacker = await viem.deployContract("Reenter", [f.lf.address]);
      await f.lf.write.verifyStudent([attacker.address], {
        account: f.verifier.account,
      });
      await attacker.write.post([CID], { value: REWARD });
      await attacker.write.cancel([1n]);
      return { ...f, attacker };
    }

    it("balance is zeroed before the ETH is sent", async () => {
      const { lf, attacker } = await setup(reenterFixture);
      await attacker.write.setMode([true, false]);
      await attacker.write.attack();
      assert.equal(await attacker.read.reentryAttempted(), true);
      assert.equal(await attacker.read.balanceSeenDuringReceive(), 0n);
      assert.equal(await attacker.read.receivedTotal(), REWARD);
      assert.equal(await lf.read.balances([attacker.address]), 0n);
    });

    it("a re-entrant withdraw is blocked by the reentrancy guard", async () => {
      const { lf, attacker } = await setup(reenterFixture);
      await attacker.write.setMode([true, false]);
      await attacker.write.attack();
      assert.equal(await attacker.read.reentrySucceeded(), false);
      const reason = await attacker.read.reentryError();
      assert.equal(
        reason.slice(0, 10),
        toFunctionSelector("ReentrancyGuardReentrantCall()"),
      );
      // Paid exactly once.
      assert.equal(
        await publicClient.getBalance({ address: attacker.address }),
        REWARD,
      );
      assert.equal(await publicClient.getBalance({ address: lf.address }), 0n);
    });

    it("a receiver that re-enters without catching makes the whole withdraw fail", async () => {
      const { lf, attacker } = await setup(reenterFixture);
      await attacker.write.setMode([false, false]);
      await viem.assertions.revertWithCustomError(
        attacker.write.attack(),
        lf,
        "TransferFailed",
      );
      assert.equal(await lf.read.balances([attacker.address]), REWARD);
      assert.equal(await lf.read.totalCredited(), REWARD);
    });

    it("reverts with TransferFailed when the receiver rejects ETH", async () => {
      const { lf, attacker } = await setup(reenterFixture);
      await attacker.write.setMode([false, true]);
      await viem.assertions.revertWithCustomError(
        attacker.write.attack(),
        lf,
        "TransferFailed",
      );
      assert.equal(await lf.read.balances([attacker.address]), REWARD);
    });
  });

  describe("config and pause", () => {
    it("admin updates the config and emits ConfigUpdated", async () => {
      const { lf, admin } = await setup(deployFixture);
      const newStake = parseEther("0.001");
      await viem.assertions.emitWithArgs(
        lf.write.setConfig([MIN_REWARD * 2n, newStake, MIN_WINDOW], {
          account: admin.account,
        }),
        lf,
        "ConfigUpdated",
        [MIN_REWARD * 2n, newStake, MIN_WINDOW],
      );
      assert.equal(await lf.read.minReward(), MIN_REWARD * 2n);
      assert.equal(await lf.read.claimStake(), newStake);
      assert.equal(await lf.read.confirmWindow(), MIN_WINDOW);
    });

    it("rejects out-of-bounds config", async () => {
      const { lf, admin } = await setup(deployFixture);
      const w = WINDOW;
      const cases: Array<[bigint, bigint, bigint]> = [
        [0n, STAKE, w],
        [maxUint128 + 1n, STAKE, w],
        [MIN_REWARD, 0n, w],
        [MIN_REWARD, maxUint128 + 1n, w],
        [MIN_REWARD, STAKE, MIN_WINDOW - 1n],
        [MIN_REWARD, STAKE, MAX_WINDOW + 1n],
      ];
      for (const args of cases) {
        await viem.assertions.revertWithCustomError(
          lf.write.setConfig(args, { account: admin.account }),
          lf,
          "InvalidConfig",
        );
      }
    });

    it("only the admin can set config, pause and unpause", async () => {
      const { lf, verifier, arbiter, alice } = await setup(deployFixture);
      for (const caller of [verifier, arbiter, alice]) {
        await viem.assertions.revertWithCustomErrorWithArgs(
          lf.write.setConfig([MIN_REWARD, STAKE, WINDOW], {
            account: caller.account,
          }),
          lf,
          "AccessControlUnauthorizedAccount",
          [getAddress(caller.account.address), DEFAULT_ADMIN_ROLE],
        );
        await viem.assertions.revertWithCustomError(
          lf.write.pause({ account: caller.account }),
          lf,
          "AccessControlUnauthorizedAccount",
        );
        await viem.assertions.revertWithCustomError(
          lf.write.unpause({ account: caller.account }),
          lf,
          "AccessControlUnauthorizedAccount",
        );
      }
    });

    it("pause and unpause emit OZ events and gate posting", async () => {
      const { lf, admin, alice } = await setup(deployFixture);
      await viem.assertions.emitWithArgs(
        lf.write.pause({ account: admin.account }),
        lf,
        "Paused",
        [getAddress(admin.account.address)],
      );
      assert.equal(await lf.read.paused(), true);
      await viem.assertions.emitWithArgs(
        lf.write.unpause({ account: admin.account }),
        lf,
        "Unpaused",
        [getAddress(admin.account.address)],
      );
      await lf.write.postItem([CID], { account: alice.account, value: REWARD });
      assert.equal(await lf.read.itemCount(), 1n);
    });

    it("a config change after a claim does not change that item's deposit", async () => {
      const { lf, admin, alice, bob, carol } = await setup(claimedFixture);
      const newStake = STAKE * 3n;
      await lf.write.setConfig([MIN_REWARD, newStake, WINDOW], {
        account: admin.account,
      });
      assert.equal((await lf.read.getItem([1n])).stake, STAKE);
      await lf.write.confirmReturn([1n], { account: alice.account });
      assert.equal(
        await lf.read.balances([bob.account.address]),
        REWARD + STAKE,
      );

      // New claims use the new deposit.
      await lf.write.postItem([CID], { account: alice.account, value: REWARD });
      await viem.assertions.revertWithCustomError(
        lf.write.claimItem([2n], { account: carol.account, value: STAKE }),
        lf,
        "WrongStake",
      );
      await lf.write.claimItem([2n], {
        account: carol.account,
        value: newStake,
      });
      assert.equal((await lf.read.getItem([2n])).stake, newStake);
    });

    it("shortening the window after a claim does not shorten that claim's window", async () => {
      const { lf, admin, alice, bob, carol, claimedAt } =
        await setup(claimedFixture);
      await lf.write.setConfig([MIN_REWARD, STAKE, MIN_WINDOW], {
        account: admin.account,
      });
      assert.equal(BigInt((await lf.read.getItem([1n])).claimWindow), WINDOW);

      await networkHelpers.time.setNextBlockTimestamp(
        claimedAt + MIN_WINDOW + 1n,
      );
      await viem.assertions.revertWithCustomError(
        lf.write.claimAfterTimeout([1n], { account: bob.account }),
        lf,
        "WindowOpen",
      );
      await networkHelpers.time.setNextBlockTimestamp(claimedAt + WINDOW);
      await lf.write.rejectClaim([1n], { account: alice.account });
      assert.equal((await lf.read.getItem([1n])).status, Status.Open);

      // New claims lock the new window.
      await lf.write.claimItem([1n], { account: carol.account, value: STAKE });
      const item = await lf.read.getItem([1n]);
      assert.equal(BigInt(item.claimWindow), MIN_WINDOW);
      await networkHelpers.time.increaseTo(item.claimedAt + MIN_WINDOW);
      assert.equal(await lf.read.withinWindow([1n]), true);
      await networkHelpers.mine();
      assert.equal(await lf.read.withinWindow([1n]), false);
    });

    it("lengthening the window after a claim does not delay that claim's timeout", async () => {
      const { lf, admin, bob, claimedAt } = await setup(claimedFixture);
      await lf.write.setConfig([MIN_REWARD, STAKE, MAX_WINDOW], {
        account: admin.account,
      });
      await networkHelpers.time.setNextBlockTimestamp(claimedAt + WINDOW + 1n);
      await lf.write.claimAfterTimeout([1n], { account: bob.account });
      assert.equal(
        await lf.read.balances([bob.account.address]),
        REWARD + STAKE,
      );
    });

    it("a revoked finder's existing claim still finishes", async () => {
      const { lf, verifier, alice, bob } = await setup(claimedFixture);
      await lf.write.revokeStudent([bob.account.address], {
        account: verifier.account,
      });
      await lf.write.confirmReturn([1n], { account: alice.account });
      await lf.write.withdraw({ account: bob.account });
      assert.equal(await lf.read.balances([bob.account.address]), 0n);
    });
  });

  describe("views", () => {
    it("getItem reverts for unknown IDs", async () => {
      const { lf } = await setup(postedFixture);
      for (const id of [0n, 2n]) {
        await viem.assertions.revertWithCustomError(
          lf.read.getItem([id]),
          lf,
          "ItemNotFound",
        );
      }
    });

    it("withinWindow is true up to and including the edge, then false", async () => {
      const { lf, claimedAt } = await setup(claimedFixture);
      assert.equal(await lf.read.withinWindow([1n]), true);
      await networkHelpers.time.increaseTo(claimedAt + WINDOW);
      assert.equal(await lf.read.withinWindow([1n]), true);
      await networkHelpers.mine();
      assert.equal(await lf.read.withinWindow([1n]), false);
    });
  });

  describe("direct payments", () => {
    it("receive reverts", async () => {
      const { lf, alice } = await setup(deployFixture);
      await viem.assertions.revertWithCustomError(
        alice.sendTransaction({ to: lf.address, value: 1n }),
        lf,
        "DirectPaymentNotAllowed",
      );
    });

    it("fallback reverts, with or without value", async () => {
      const { lf, alice } = await setup(deployFixture);
      const data = encodeFunctionData({
        abi: [
          { type: "function", name: "notAFunction", inputs: [], outputs: [] },
        ],
        functionName: "notAFunction",
      });
      await viem.assertions.revertWithCustomError(
        alice.sendTransaction({ to: lf.address, data }),
        lf,
        "DirectPaymentNotAllowed",
      );
      await viem.assertions.revertWithCustomError(
        alice.sendTransaction({ to: lf.address, data, value: 1n }),
        lf,
        "DirectPaymentNotAllowed",
      );
    });
  });
});
