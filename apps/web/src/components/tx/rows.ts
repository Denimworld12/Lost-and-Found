import type { TxSnapshot, TxStep } from "@/lib/tx-flow";

export type RowState = "waiting" | "active" | "done" | "failed";

export interface TxRow {
  id: TxStep;
  state: RowState;
}

/** The wallet and chain steps after the optional `prepare` row, in order. */
const WALLET_STEPS: TxStep[] = [
  "checking",
  "awaitingWallet",
  "pending",
  "confirmed",
];

/**
 * TxPanel rows and their dots. The optional `prepare` row (e.g. "Uploading photo") comes
 * first; the rest follow the flow's step. A stopped flow marks its step `failed`.
 */
export function txRows(snapshot: TxSnapshot, hasPrepare: boolean): TxRow[] {
  const stopped = snapshot.state === "failed" || snapshot.state === "cancelled";
  const confirmed = snapshot.state === "confirmed";
  const rows: TxRow[] = [];

  if (hasPrepare) {
    let state: RowState = "waiting";
    if (snapshot.prepared || confirmed) state = "done";
    else if (snapshot.step === "prepare") state = stopped ? "failed" : "active";
    rows.push({ id: "prepare", state });
  }

  // Without a prepare row (e.g. reading the deposit first), that time counts as checking.
  const step =
    snapshot.step === "prepare" && !hasPrepare ? "checking" : snapshot.step;
  const current = step === "prepare" ? -1 : WALLET_STEPS.indexOf(step);
  WALLET_STEPS.forEach((id, index) => {
    let state: RowState = "waiting";
    if (confirmed || index < current) state = "done";
    else if (index === current && snapshot.state !== "idle")
      state = stopped ? "failed" : "active";
    rows.push({ id, state });
  });
  return rows;
}
