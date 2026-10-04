"use client";

import { useState, type ReactNode } from "react";
import { useConnect, useConnectors, useSwitchChain } from "wagmi";
import { NodeDot } from "@/components/item/node-dot";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useIsClient } from "@/hooks/useIsClient";
import {
  isMobileBrowser,
  metaMaskDeepLink,
  useWallet,
} from "@/hooks/useWallet";
import { appChain } from "@/lib/chain";
import { isUserRejection } from "@/lib/errors";
import { shortAddress } from "@/lib/format";
import { wrongWalletMessage } from "@/lib/tx-flow";

/** Connects the injected (MetaMask) connector; a rejection is just a cancelled action. */
export function useConnectWallet() {
  const connectors = useConnectors();
  const connect = useConnect();
  const [error, setError] = useState<string | null>(null);
  async function connectWallet() {
    setError(null);
    const connector = connectors[0];
    if (!connector) return;
    try {
      await connect.mutateAsync({ connector });
    } catch (cause) {
      if (!isUserRejection(cause))
        setError("MetaMask didn't connect. Unlock it and try again.");
    }
  }
  return { connectWallet, pending: connect.isPending, error };
}

/** Asks MetaMask to switch to the app chain. */
export function useSwitchToAppChain() {
  const switchChain = useSwitchChain();
  const [error, setError] = useState<string | null>(null);
  async function switchToAppChain() {
    setError(null);
    try {
      await switchChain.mutateAsync({ chainId: appChain.id });
    } catch (cause) {
      if (!isUserRejection(cause))
        setError(`Open MetaMask and switch the network to ${appChain.name}.`);
    }
  }
  return { switchToAppChain, pending: switchChain.isPending, error };
}

function GateNote({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-start gap-9 text-body-sm text-snow">
      <NodeDot tone="magenta" className="mt-5" />
      <span>{children}</span>
    </p>
  );
}

/**
 * Renders `children` (the write buttons) once MetaMask is installed, connected, on the app
 * chain and set to the wallet linked to the account. Otherwise shows the one fix needed.
 * UX only: `useTxFlow` repeats every check before it writes.
 */
export function WalletGate({ children }: { children: ReactNode }) {
  const isClient = useIsClient();
  const wallet = useWallet();
  const connect = useConnectWallet();
  const switcher = useSwitchToAppChain();

  if (wallet.status === "loading" || !isClient)
    return <Skeleton className="h-44 w-200 rounded-pill" />;

  if (wallet.status === "no-provider") {
    return isMobileBrowser() ? (
      <div className="flex flex-col gap-9">
        <Button asChild className="w-fit">
          <a href={metaMaskDeepLink()}>Open in MetaMask app</a>
        </Button>
        <p className="text-body-sm text-cloud">
          On a phone, MetaMask works inside the MetaMask app&apos;s browser.
        </p>
      </div>
    ) : (
      <div className="flex flex-col gap-9">
        <Button asChild className="w-fit">
          <a
            href="https://metamask.io/download/"
            target="_blank"
            rel="noreferrer"
          >
            Install MetaMask
          </a>
        </Button>
        <p className="text-body-sm text-cloud">
          You need the MetaMask browser extension to post or claim.
        </p>
      </div>
    );
  }

  if (wallet.status === "disconnected") {
    return (
      <div className="flex flex-col gap-9">
        <Button
          onClick={connect.connectWallet}
          disabled={connect.pending}
          className="w-fit"
        >
          {connect.pending ? "Connecting…" : "Connect wallet"}
        </Button>
        {connect.error && <GateNote>{connect.error}</GateNote>}
      </div>
    );
  }

  if (wallet.status === "wrong-chain") {
    return (
      <div className="flex flex-col gap-9">
        <GateNote>MetaMask is on another network.</GateNote>
        <Button
          onClick={switcher.switchToAppChain}
          disabled={switcher.pending}
          className="w-fit"
        >
          {switcher.pending ? "Switching…" : `Switch to ${appChain.name}`}
        </Button>
        {switcher.error && <GateNote>{switcher.error}</GateNote>}
      </div>
    );
  }

  if (wallet.status === "wrong-wallet" && wallet.linkedWallet) {
    return (
      <GateNote>
        {wrongWalletMessage(wallet.linkedWallet)} MetaMask is using{" "}
        <span className="font-mono tabular">
          {shortAddress(wallet.address!)}
        </span>
        .
      </GateNote>
    );
  }

  return <>{children}</>;
}
