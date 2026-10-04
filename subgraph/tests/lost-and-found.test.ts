import { Address, BigInt, ethereum } from "@graphprotocol/graph-ts";
import {
  afterEach,
  assert,
  clearStore,
  describe,
  newMockEvent,
  test,
} from "matchstick-as/assembly/index";
import {
  ClaimRejected,
  ConfigUpdated,
  DisputeRaised,
  DisputeResolved,
  ItemCancelled,
  ItemClaimed,
  ItemPosted,
  ReturnConfirmed,
  TimeoutClaimed,
} from "../generated/LostAndFound/LostAndFound";
import {
  handleClaimRejected,
  handleConfigUpdated,
  handleDisputeRaised,
  handleDisputeResolved,
  handleItemCancelled,
  handleItemClaimed,
  handleItemPosted,
  handleReturnConfirmed,
  handleTimeoutClaimed,
} from "../src/mapping";

const OWNER = Address.fromString("0xc3094e09bb56e350bcdd9039ae2ce3e73d3900cf");
const FINDER = Address.fromString("0x3ba2113c559f36040366477d26e286ffae8928a1");
const ARBITER = Address.fromString(
  "0x9ff4cd7d8daf39334b469d7c009e5bc4830b6947",
);
const REWARD = BigInt.fromString("1000000000000000"); // 0.001 ETH
const STAKE = BigInt.fromString("500000000000000"); // 0.0005 ETH
const PAYOUT = REWARD.plus(STAKE);
const WINDOW = BigInt.fromI32(259200); // 3 days
const CID = "bafkreigh2akiscaildcqabsyg3dfr6chu3fgpregiymsck7e7aqa4s52zy";

let nextLogIndex = 0;

/** A mock event with a unique tx hash + log index and the given block time. */
function mockEvent(time: i32): ethereum.Event {
  const event = newMockEvent();
  event.logIndex = BigInt.fromI32(nextLogIndex++);
  event.block.timestamp = BigInt.fromI32(time);
  event.parameters = new Array();
  return event;
}

function uint(name: string, value: BigInt): ethereum.EventParam {
  return new ethereum.EventParam(
    name,
    ethereum.Value.fromUnsignedBigInt(value),
  );
}

function addr(name: string, value: Address): ethereum.EventParam {
  return new ethereum.EventParam(name, ethereum.Value.fromAddress(value));
}

function configUpdated(window: BigInt, time: i32): void {
  const event = changetype<ConfigUpdated>(mockEvent(time));
  event.parameters.push(uint("minReward", REWARD));
  event.parameters.push(uint("claimStake", STAKE));
  event.parameters.push(uint("confirmWindow", window));
  handleConfigUpdated(event);
}

function posted(id: i32, time: i32): ItemPosted {
  const event = changetype<ItemPosted>(mockEvent(time));
  event.parameters.push(uint("id", BigInt.fromI32(id)));
  event.parameters.push(addr("owner", OWNER));
  event.parameters.push(uint("reward", REWARD));
  event.parameters.push(
    new ethereum.EventParam("cid", ethereum.Value.fromString(CID)),
  );
  handleItemPosted(event);
  return event;
}

function claimed(id: i32, time: i32): ItemClaimed {
  const event = changetype<ItemClaimed>(mockEvent(time));
  event.parameters.push(uint("id", BigInt.fromI32(id)));
  event.parameters.push(addr("finder", FINDER));
  event.parameters.push(uint("stake", STAKE));
  handleItemClaimed(event);
  return event;
}

function disputed(id: i32, time: i32): void {
  const event = changetype<DisputeRaised>(mockEvent(time));
  event.parameters.push(uint("id", BigInt.fromI32(id)));
  event.parameters.push(addr("by", OWNER));
  handleDisputeRaised(event);
}

function resolved(id: i32, finderWins: boolean, time: i32): DisputeResolved {
  const event = changetype<DisputeResolved>(mockEvent(time));
  event.parameters.push(uint("id", BigInt.fromI32(id)));
  event.parameters.push(
    new ethereum.EventParam(
      "finderWins",
      ethereum.Value.fromBoolean(finderWins),
    ),
  );
  event.parameters.push(addr("arbiter", ARBITER));
  handleDisputeResolved(event);
  return event;
}

function eventId(event: ethereum.Event): string {
  return event.transaction.hash.concatI32(event.logIndex.toI32()).toHexString();
}

function assertStats(
  posted: i32,
  returned: i32,
  rewardsPaid: BigInt,
  open: i32,
): void {
  assert.fieldEquals("Stats", "global", "itemsPosted", posted.toString());
  assert.fieldEquals("Stats", "global", "itemsReturned", returned.toString());
  assert.fieldEquals(
    "Stats",
    "global",
    "totalRewardsPaid",
    rewardsPaid.toString(),
  );
  assert.fieldEquals("Stats", "global", "openItems", open.toString());
}

function assertUnclaimed(id: string): void {
  assert.fieldEquals("Item", id, "status", "Open");
  assert.fieldEquals("Item", id, "finder", "null");
  assert.fieldEquals("Item", id, "stake", "0");
  assert.fieldEquals("Item", id, "claimedAt", "null");
  assert.fieldEquals("Item", id, "claimWindow", "0");
}

describe("LostAndFound mappings", () => {
  afterEach(() => {
    clearStore();
  });

  test("ItemPosted creates an open item, a Posted event and counts it", () => {
    configUpdated(WINDOW, 100);
    const event = posted(1, 1000);

    assert.fieldEquals("Item", "1", "itemId", "1");
    assert.fieldEquals("Item", "1", "owner", OWNER.toHexString());
    assert.fieldEquals("Item", "1", "reward", REWARD.toString());
    assert.fieldEquals("Item", "1", "metadataCID", CID);
    assert.fieldEquals("Item", "1", "createdAt", "1000");
    assert.fieldEquals("Item", "1", "updatedAt", "1000");
    assertUnclaimed("1");

    const id = eventId(event);
    assert.fieldEquals("ItemEvent", id, "item", "1");
    assert.fieldEquals("ItemEvent", id, "kind", "Posted");
    assert.fieldEquals("ItemEvent", id, "actor", OWNER.toHexString());
    assert.fieldEquals("ItemEvent", id, "amount", REWARD.toString());
    assert.fieldEquals("ItemEvent", id, "timestamp", "1000");
    assert.fieldEquals(
      "ItemEvent",
      id,
      "txHash",
      event.transaction.hash.toHexString(),
    );
    assertStats(1, 0, BigInt.zero(), 1);
  });

  test("ItemClaimed locks the finder, stake and the current confirm window", () => {
    configUpdated(WINDOW, 100);
    posted(1, 1000);
    const event = claimed(1, 2000);
    // A later config change leaves the claimed item's window alone.
    configUpdated(BigInt.fromI32(300), 2100);

    assert.fieldEquals("Item", "1", "status", "Claimed");
    assert.fieldEquals("Item", "1", "finder", FINDER.toHexString());
    assert.fieldEquals("Item", "1", "stake", STAKE.toString());
    assert.fieldEquals("Item", "1", "claimedAt", "2000");
    assert.fieldEquals("Item", "1", "claimWindow", WINDOW.toString());
    assert.fieldEquals("Item", "1", "updatedAt", "2000");
    assert.fieldEquals("Config", "global", "confirmWindow", "300");

    const id = eventId(event);
    assert.fieldEquals("ItemEvent", id, "kind", "Claimed");
    assert.fieldEquals("ItemEvent", id, "actor", FINDER.toHexString());
    assert.fieldEquals("ItemEvent", id, "amount", STAKE.toString());
    assertStats(1, 0, BigInt.zero(), 0);
  });

  test("ReturnConfirmed completes the item and pays out the reward", () => {
    configUpdated(WINDOW, 100);
    posted(1, 1000);
    claimed(1, 2000);
    const event = changetype<ReturnConfirmed>(mockEvent(3000));
    event.parameters.push(uint("id", BigInt.fromI32(1)));
    event.parameters.push(addr("finder", FINDER));
    event.parameters.push(uint("amount", PAYOUT));
    handleReturnConfirmed(event);

    assert.fieldEquals("Item", "1", "status", "Completed");
    assert.fieldEquals("Item", "1", "finder", FINDER.toHexString());
    assert.fieldEquals("Item", "1", "updatedAt", "3000");
    const id = eventId(event);
    assert.fieldEquals("ItemEvent", id, "kind", "Confirmed");
    assert.fieldEquals("ItemEvent", id, "actor", FINDER.toHexString());
    assert.fieldEquals("ItemEvent", id, "amount", PAYOUT.toString());
    assertStats(1, 1, REWARD, 0);
  });

  test("ClaimRejected clears the claim and reopens the item", () => {
    configUpdated(WINDOW, 100);
    posted(1, 1000);
    claimed(1, 2000);
    const event = changetype<ClaimRejected>(mockEvent(3000));
    event.parameters.push(uint("id", BigInt.fromI32(1)));
    event.parameters.push(addr("finder", FINDER));
    event.parameters.push(uint("stakeToOwner", STAKE));
    handleClaimRejected(event);

    assertUnclaimed("1");
    assert.fieldEquals("Item", "1", "updatedAt", "3000");
    const id = eventId(event);
    assert.fieldEquals("ItemEvent", id, "kind", "Rejected");
    assert.fieldEquals("ItemEvent", id, "actor", FINDER.toHexString());
    assert.fieldEquals("ItemEvent", id, "amount", STAKE.toString());
    assertStats(1, 0, BigInt.zero(), 1);
  });

  test("DisputeRaised marks the item disputed", () => {
    configUpdated(WINDOW, 100);
    posted(1, 1000);
    claimed(1, 2000);
    const event = changetype<DisputeRaised>(mockEvent(3000));
    event.parameters.push(uint("id", BigInt.fromI32(1)));
    event.parameters.push(addr("by", OWNER));
    handleDisputeRaised(event);

    assert.fieldEquals("Item", "1", "status", "Disputed");
    assert.fieldEquals("Item", "1", "updatedAt", "3000");
    const id = eventId(event);
    assert.fieldEquals("ItemEvent", id, "kind", "Disputed");
    assert.fieldEquals("ItemEvent", id, "actor", OWNER.toHexString());
    assert.fieldEquals("ItemEvent", id, "amount", "null");
    assertStats(1, 0, BigInt.zero(), 0);
  });

  test("DisputeResolved for the finder completes the item", () => {
    configUpdated(WINDOW, 100);
    posted(1, 1000);
    claimed(1, 2000);
    disputed(1, 3000);
    const event = resolved(1, true, 4000);

    assert.fieldEquals("Item", "1", "status", "Completed");
    assert.fieldEquals("Item", "1", "finder", FINDER.toHexString());
    const id = eventId(event);
    assert.fieldEquals("ItemEvent", id, "kind", "Resolved");
    assert.fieldEquals("ItemEvent", id, "actor", ARBITER.toHexString());
    assert.fieldEquals("ItemEvent", id, "finderWins", "true");
    assertStats(1, 1, REWARD, 0);
  });

  test("DisputeResolved for the owner reopens the item", () => {
    configUpdated(WINDOW, 100);
    posted(1, 1000);
    claimed(1, 2000);
    disputed(1, 3000);
    const event = resolved(1, false, 4000);

    assertUnclaimed("1");
    assert.fieldEquals("Item", "1", "updatedAt", "4000");
    assert.fieldEquals("ItemEvent", eventId(event), "finderWins", "false");
    assertStats(1, 0, BigInt.zero(), 1);
  });

  test("TimeoutClaimed completes the item and pays out the reward", () => {
    configUpdated(WINDOW, 100);
    posted(1, 1000);
    claimed(1, 2000);
    const event = changetype<TimeoutClaimed>(mockEvent(300000));
    event.parameters.push(uint("id", BigInt.fromI32(1)));
    event.parameters.push(addr("finder", FINDER));
    event.parameters.push(uint("amount", PAYOUT));
    handleTimeoutClaimed(event);

    assert.fieldEquals("Item", "1", "status", "Completed");
    const id = eventId(event);
    assert.fieldEquals("ItemEvent", id, "kind", "TimeoutClaimed");
    assert.fieldEquals("ItemEvent", id, "actor", FINDER.toHexString());
    assert.fieldEquals("ItemEvent", id, "amount", PAYOUT.toString());
    assertStats(1, 1, REWARD, 0);
  });

  test("ItemCancelled cancels an open item with the owner as actor", () => {
    configUpdated(WINDOW, 100);
    posted(1, 1000);
    posted(2, 1100);
    const event = changetype<ItemCancelled>(mockEvent(2000));
    event.parameters.push(uint("id", BigInt.fromI32(1)));
    handleItemCancelled(event);

    assert.fieldEquals("Item", "1", "status", "Cancelled");
    assert.fieldEquals("Item", "2", "status", "Open");
    const id = eventId(event);
    assert.fieldEquals("ItemEvent", id, "kind", "Cancelled");
    assert.fieldEquals("ItemEvent", id, "actor", OWNER.toHexString());
    assert.fieldEquals("ItemEvent", id, "amount", "null");
    assertStats(2, 0, BigInt.zero(), 1);
  });

  test("Events for an unknown item are ignored", () => {
    configUpdated(WINDOW, 100);
    const event = claimed(7, 2000);

    assert.notInStore("Item", "7");
    assert.notInStore("ItemEvent", eventId(event));
    assert.entityCount("ItemEvent", 0);
  });

  test("A reopened item can be claimed again and keeps its full history", () => {
    configUpdated(WINDOW, 100);
    posted(1, 1000);
    claimed(1, 2000);
    disputed(1, 3000);
    resolved(1, false, 4000);
    configUpdated(BigInt.fromI32(300), 4500);
    const event = claimed(1, 5000);

    assert.fieldEquals("Item", "1", "status", "Claimed");
    assert.fieldEquals("Item", "1", "claimedAt", "5000");
    assert.fieldEquals("Item", "1", "claimWindow", "300");
    assert.entityCount("ItemEvent", 5);
    assert.fieldEquals("ItemEvent", eventId(event), "timestamp", "5000");
    assertStats(1, 0, BigInt.zero(), 0);
  });
});
