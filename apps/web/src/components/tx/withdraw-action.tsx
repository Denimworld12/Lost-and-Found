"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { useTxFlow } from "@/hooks/useTxFlow";
import { formatEth } from "@/lib/format";
import { cn } from "@/lib/utils";
import { TxPanel } from "./tx-panel";
import { WalletGate } from "./wallet-gate";

/** "Withdraw {amount}": sends the whole credited balance to the wallet (`withdraw()`). */
export function WithdrawAction({
  amount,
  onDone,
  className,
}: {
  amount: bigint;
  /** Called after the withdrawal is confirmed. */
  onDone?: () => void;
  className?: string;
}) {
  const flow = useTxFlow();
  const { state, reset } = flow;

  useEffect(() => {
    if (state !== "confirmed") return;
    const timer = setTimeout(() => {
      reset();
      onDone?.();
    }, 1_500);
    return () => clearTimeout(timer);
  }, [state, reset, onDone]);

  if (state !== "idle") {
    return (
      <TxPanel
        flow={flow}
        title="Withdrawing to your wallet"
        onDismiss={reset}
        className={cn("w-full", className)}
      />
    );
  }
  return (
    <WalletGate>
      <Button
        className={className}
        disabled={amount === 0n}
        onClick={() =>
          void flow.run({
            functionName: "withdraw",
            args: [],
            successMessage: "Withdrawn to your wallet",
          })
        }
      >
        Withdraw {formatEth(amount)}
      </Button>
    </WalletGate>
  );
}
