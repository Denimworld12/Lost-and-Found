import { describe, expect, it } from "vitest";
import type { ItemEvent } from "@/lib/graph";
import { statusExplanation } from "../item/status";

const event = (kind: ItemEvent["kind"], finderWins?: boolean): ItemEvent => ({
  kind,
  actor: null,
  amount: null,
  finderWins,
  txHash: "0x01",
  timestamp: null,
});

describe("statusExplanation", () => {
  it("says how a completed item completed", () => {
    expect(
      statusExplanation("Completed", [event("Confirmed"), event("Claimed")]),
    ).toBe("The owner confirmed the item was returned.");
    expect(statusExplanation("Completed", [event("TimeoutClaimed")])).toBe(
      "The confirm window passed without a response, so the finder was paid automatically.",
    );
    expect(statusExplanation("Completed", [event("Resolved", true)])).toBe(
      "A dispute was raised and the arbiter ruled in the finder's favor.",
    );
  });

  it("falls back to the neutral line when the history can't tell", () => {
    const neutral = "The finder was paid the reward.";
    expect(statusExplanation("Completed", undefined)).toBe(neutral);
    expect(statusExplanation("Completed", [])).toBe(neutral);
    expect(statusExplanation("Completed", [event("Claimed")])).toBe(neutral);
  });

  it("ignores history for other statuses", () => {
    expect(statusExplanation("Open", [event("Resolved", false)])).toBe(
      "Still lost. The reward is locked until someone returns it.",
    );
  });
});
