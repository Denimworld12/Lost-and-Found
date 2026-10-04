import { BigInt, Bytes, ethereum, log } from "@graphprotocol/graph-ts";
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
import { Config, Item, ItemEvent, Stats } from "../generated/schema";

const GLOBAL = "global";
const ZERO = BigInt.zero();
const ONE = BigInt.fromI32(1);

function loadStats(): Stats {
  let stats = Stats.load(GLOBAL);
  if (stats == null) {
    stats = new Stats(GLOBAL);
    stats.itemsPosted = ZERO;
    stats.itemsReturned = ZERO;
    stats.totalRewardsPaid = ZERO;
    stats.openItems = ZERO;
  }
  return stats;
}

/** Every handler except ItemPosted runs on an item the contract has already created. */
function loadItem(id: BigInt): Item | null {
  const item = Item.load(id.toString());
  if (item == null) log.error("Event for unknown item {}", [id.toString()]);
  return item;
}

/**
 * Records one step of an item's history. `actor` is the address the event names (the owner
 * for Posted and Cancelled, the finder for claim outcomes, the disputer, the arbiter), as in
 * `toItemEvent` in apps/web/src/lib/graph.ts.
 */
function addEvent(
  item: Item,
  kind: string,
  actor: Bytes,
  amount: BigInt | null,
  event: ethereum.Event,
): ItemEvent {
  const record = new ItemEvent(
    event.transaction.hash.concatI32(event.logIndex.toI32()),
  );
  record.item = item.id;
  record.kind = kind;
  record.actor = actor;
  record.amount = amount;
  record.txHash = event.transaction.hash;
  record.timestamp = event.block.timestamp;
  return record;
}

/** The finder is paid reward + stake (ReturnConfirmed, TimeoutClaimed, DisputeResolved). */
function complete(item: Item, stats: Stats): void {
  item.status = "Completed";
  stats.itemsReturned = stats.itemsReturned.plus(ONE);
  stats.totalRewardsPaid = stats.totalRewardsPaid.plus(item.reward);
}

/** The claim is undone and the item is open again (ClaimRejected, DisputeResolved). */
function reopen(item: Item, stats: Stats): void {
  item.status = "Open";
  item.finder = null;
  item.stake = ZERO;
  item.claimedAt = null;
  item.claimWindow = ZERO;
  stats.openItems = stats.openItems.plus(ONE);
}

export function handleItemPosted(event: ItemPosted): void {
  const item = new Item(event.params.id.toString());
  item.itemId = event.params.id;
  item.owner = event.params.owner;
  item.finder = null;
  item.reward = event.params.reward;
  item.stake = ZERO;
  item.metadataCID = event.params.cid;
  item.status = "Open";
  item.createdAt = event.block.timestamp;
  item.claimedAt = null;
  item.claimWindow = ZERO;
  item.updatedAt = event.block.timestamp;
  item.save();

  addEvent(
    item,
    "Posted",
    event.params.owner,
    event.params.reward,
    event,
  ).save();

  const stats = loadStats();
  stats.itemsPosted = stats.itemsPosted.plus(ONE);
  stats.openItems = stats.openItems.plus(ONE);
  stats.save();
}

export function handleItemClaimed(event: ItemClaimed): void {
  const item = loadItem(event.params.id);
  if (item == null) return;
  item.status = "Claimed";
  item.finder = event.params.finder;
  item.stake = event.params.stake;
  item.claimedAt = event.block.timestamp;
  // The constructor emits ConfigUpdated in the deploy block (startBlock), so this is always set.
  const config = Config.load(GLOBAL);
  item.claimWindow = config == null ? ZERO : config.confirmWindow;
  item.updatedAt = event.block.timestamp;
  item.save();

  addEvent(
    item,
    "Claimed",
    event.params.finder,
    event.params.stake,
    event,
  ).save();

  const stats = loadStats();
  stats.openItems = stats.openItems.minus(ONE);
  stats.save();
}

export function handleReturnConfirmed(event: ReturnConfirmed): void {
  const item = loadItem(event.params.id);
  if (item == null) return;
  const stats = loadStats();
  complete(item, stats);
  item.updatedAt = event.block.timestamp;
  item.save();
  stats.save();

  addEvent(
    item,
    "Confirmed",
    event.params.finder,
    event.params.amount,
    event,
  ).save();
}

export function handleClaimRejected(event: ClaimRejected): void {
  const item = loadItem(event.params.id);
  if (item == null) return;
  const stats = loadStats();
  reopen(item, stats);
  item.updatedAt = event.block.timestamp;
  item.save();
  stats.save();

  addEvent(
    item,
    "Rejected",
    event.params.finder,
    event.params.stakeToOwner,
    event,
  ).save();
}

export function handleDisputeRaised(event: DisputeRaised): void {
  const item = loadItem(event.params.id);
  if (item == null) return;
  item.status = "Disputed";
  item.updatedAt = event.block.timestamp;
  item.save();

  addEvent(item, "Disputed", event.params.by, null, event).save();
}

export function handleDisputeResolved(event: DisputeResolved): void {
  const item = loadItem(event.params.id);
  if (item == null) return;
  const stats = loadStats();
  if (event.params.finderWins) complete(item, stats);
  else reopen(item, stats);
  item.updatedAt = event.block.timestamp;
  item.save();
  stats.save();

  const record = addEvent(item, "Resolved", event.params.arbiter, null, event);
  record.finderWins = event.params.finderWins;
  record.save();
}

export function handleTimeoutClaimed(event: TimeoutClaimed): void {
  const item = loadItem(event.params.id);
  if (item == null) return;
  const stats = loadStats();
  complete(item, stats);
  item.updatedAt = event.block.timestamp;
  item.save();
  stats.save();

  addEvent(
    item,
    "TimeoutClaimed",
    event.params.finder,
    event.params.amount,
    event,
  ).save();
}

export function handleItemCancelled(event: ItemCancelled): void {
  const item = loadItem(event.params.id);
  if (item == null) return;
  item.status = "Cancelled";
  item.updatedAt = event.block.timestamp;
  item.save();

  // Only the owner can cancel, and the event carries no address.
  addEvent(item, "Cancelled", item.owner, null, event).save();

  const stats = loadStats();
  stats.openItems = stats.openItems.minus(ONE);
  stats.save();
}

export function handleConfigUpdated(event: ConfigUpdated): void {
  let config = Config.load(GLOBAL);
  if (config == null) config = new Config(GLOBAL);
  config.minReward = event.params.minReward;
  config.claimStake = event.params.claimStake;
  config.confirmWindow = event.params.confirmWindow;
  config.updatedAt = event.block.timestamp;
  config.save();
}
