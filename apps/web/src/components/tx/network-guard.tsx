"use client";

import { useAuth } from "@clerk/nextjs";
import { NodeDot } from "@/components/item/node-dot";
import { Button } from "@/components/ui/button";
import { useWallet } from "@/hooks/useWallet";
import { appChain } from "@/lib/chain";
import { shortAddress } from "@/lib/format";
import { wrongWalletMessage } from "@/lib/tx-flow";
import { useSwitchToAppChain } from "./wallet-gate";

/**
 * NetworkGuard (docs/UI_SPEC.md): Carbon bar under the nav when a signed-in student's MetaMask
 * is on the wrong network or on a wallet other than the one linked to their account. Writes
 * are blocked until it's fixed (`useTxFlow` checks again).
 */
export function NetworkGuard() {
  const { isSignedIn } = useAuth();
  const wallet = useWallet();
  const switcher = useSwitchToAppChain();
  if (!isSignedIn) return null;
  if (wallet.status !== "wrong-chain" && wallet.status !== "wrong-wallet")
    return null;

  return (
    <div role="status" className="border-b border-charcoal bg-carbon">
      <div className="page-x flex min-h-48 flex-wrap items-center gap-x-12 gap-y-9 py-9">
        <NodeDot tone="magenta" />
        {wallet.status === "wrong-chain" ? (
          <>
            <p className="text-body-sm text-snow">
              MetaMask is on another network. Switch to {appChain.name} to post
              or claim.
            </p>
            <Button
              size="sm"
              className="ml-auto"
              onClick={switcher.switchToAppChain}
              disabled={switcher.pending}
            >
              {switcher.pending ? "Switching…" : `Switch to ${appChain.name}`}
            </Button>
            {switcher.error && (
              <p className="w-full text-body-sm text-snow">{switcher.error}</p>
            )}
          </>
        ) : (
          <p className="text-body-sm text-snow">
            {wrongWalletMessage(wallet.linkedWallet!)} MetaMask is using{" "}
            <span className="font-mono tabular">
              {shortAddress(wallet.address!)}
            </span>
            .
          </p>
        )}
      </div>
    </div>
  );
}
