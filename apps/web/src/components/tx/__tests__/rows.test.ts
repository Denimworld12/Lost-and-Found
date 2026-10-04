import { describe, expect, it } from "vitest";
import { IDLE_SNAPSHOT, type TxSnapshot } from "@/lib/tx-flow";
import { txRows } from "../rows";

const snap = (patch: Partial<TxSnapshot>): TxSnapshot => ({
  ...IDLE_SNAPSHOT,
  ...patch,
});

const states = (snapshot: TxSnapshot, hasPrepare = false) =>
  txRows(snapshot, hasPrepare).map((row) => `${row.id}:${row.state}`);

describe("txRows", () => {
  it("lights the current step orange and earlier ones green", () => {
    expect(states(snap({ state: "pending", step: "pending" }))).toEqual([
      "checking:done",
      "awaitingWallet:done",
      "pending:active",
      "confirmed:waiting",
    ]);
    expect(states(snap({ state: "confirmed", step: "confirmed" }))).toEqual([
      "checking:done",
      "awaitingWallet:done",
      "pending:done",
      "confirmed:done",
    ]);
  });

  it("marks the step a failure stopped at", () => {
    expect(states(snap({ state: "failed", step: "checking" }))).toEqual([
      "checking:failed",
      "awaitingWallet:waiting",
      "pending:waiting",
      "confirmed:waiting",
    ]);
    expect(
      states(snap({ state: "cancelled", step: "awaitingWallet" }))[1],
    ).toBe("awaitingWallet:failed");
  });

  it("shows an upload row first when the flow has one", () => {
    expect(states(snap({ state: "checking", step: "prepare" }), true)).toEqual([
      "prepare:active",
      "checking:waiting",
      "awaitingWallet:waiting",
      "pending:waiting",
      "confirmed:waiting",
    ]);
    expect(
      states(
        snap({ state: "failed", step: "checking", prepared: true }),
        true,
      ).slice(0, 2),
    ).toEqual(["prepare:done", "checking:failed"]);
    // A wallet check failed before anything was uploaded.
    expect(
      states(
        snap({ state: "failed", step: "checking", prepared: false }),
        true,
      ).slice(0, 2),
    ).toEqual(["prepare:waiting", "checking:failed"]);
    expect(states(snap({ state: "failed", step: "prepare" }), true)[0]).toBe(
      "prepare:failed",
    );
  });

  it("counts a prepare step without its own row as checking", () => {
    expect(states(snap({ state: "checking", step: "prepare" }))[0]).toBe(
      "checking:active",
    );
  });

  it("leaves every row waiting while idle", () => {
    expect(states(IDLE_SNAPSHOT).every((row) => row.endsWith("waiting"))).toBe(
      true,
    );
  });
});
