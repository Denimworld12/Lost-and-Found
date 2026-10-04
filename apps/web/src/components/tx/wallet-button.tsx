"use client";

import { useState } from "react";
import { useBalance, useDisconnect } from "wagmi";
import { NodeDot } from "@/components/item/node-dot";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  isMobileBrowser,
  metaMaskDeepLink,
  useWallet,
  useWithdrawable,
} from "@/hooks/useWallet";
import { addressUrl, appChain } from "@/lib/chain";
import { formatEth, formatEthValue, shortAddress } from "@/lib/format";
import { useConnectWallet, useSwitchToAppChain } from "./wallet-gate";
import { WithdrawAction } from "./withdraw-action";

/**
 * WalletButton (docs/UI_SPEC.md): Ghost pill in the nav. Install MetaMask · Connect wallet ·
 * Switch to Sepolia (Magenta dot) · Wrong wallet (Magenta dot) · connected: Green dot, short
 * address and balance. Only shown to signed-in students.
 */
export function WalletButton() {
  const wallet = useWallet();
  const connect = useConnectWallet();
  const switcher = useSwitchToAppChain();
  const { disconnect } = useDisconnect();
  const balance = useBalance({
    address: wallet.address ?? undefined,
    chainId: appChain.id,
    query: { enabled: wallet.status === "ready" },
  });

  switch (wallet.status) {
    case "loading":
      return <span aria-hidden="true" className="h-36 w-120" />;
    case "no-provider":
      return isMobileBrowser() ? (
        <Button asChild variant="ghost" size="sm">
          <a href={metaMaskDeepLink()}>Open in MetaMask</a>
        </Button>
      ) : (
        <Button asChild variant="ghost" size="sm">
          <a
            href="https://metamask.io/download/"
            target="_blank"
            rel="noreferrer"
          >
            Install MetaMask
          </a>
        </Button>
      );
    case "disconnected":
      return (
        <Button
          variant="ghost"
          size="sm"
          onClick={connect.connectWallet}
          disabled={connect.pending}
        >
          {connect.pending ? "Connecting…" : "Connect wallet"}
        </Button>
      );
    case "wrong-chain":
      return (
        <Button
          variant="ghost"
          size="sm"
          onClick={switcher.switchToAppChain}
          disabled={switcher.pending}
        >
          <NodeDot tone="magenta" />
          Switch to {appChain.name}
        </Button>
      );
  }

  const explorer = wallet.address ? addressUrl(wallet.address) : null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="font-mono normal-case"
          aria-label={
            wallet.status === "wrong-wallet"
              ? "Wrong wallet connected. Wallet menu"
              : `Wallet ${wallet.address}. Wallet menu`
          }
        >
          {wallet.status === "wrong-wallet" ? (
            <>
              <NodeDot tone="magenta" />
              <span className="font-clash uppercase">Wrong wallet</span>
            </>
          ) : (
            <>
              <NodeDot tone="green" />
              <span className="tabular">{shortAddress(wallet.address!)}</span>
              {balance.data && (
                <span className="hidden text-cloud tabular lg:inline">
                  {formatEthValue(balance.data.value)} ETH
                </span>
              )}
            </>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel className="font-mono normal-case">
          {shortAddress(wallet.address!)}
          {balance.data ? ` · ${formatEth(balance.data.value)}` : ""}
        </DropdownMenuLabel>
        {wallet.status === "wrong-wallet" && wallet.linkedWallet && (
          <DropdownMenuLabel className="normal-case">
            Your account uses {shortAddress(wallet.linkedWallet)}. Switch to it
            in MetaMask.
          </DropdownMenuLabel>
        )}
        <DropdownMenuSeparator />
        {explorer && (
          <DropdownMenuItem asChild>
            <a href={explorer} target="_blank" rel="noreferrer">
              View on Etherscan
            </a>
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onSelect={() => disconnect()}>
          Disconnect
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Header balance chip: shows what the contract owes the signed-in student and withdraws it in
 * a dialog. Hidden when the balance is zero.
 */
export function BalanceChip() {
  const { linkedWallet } = useWallet();
  const withdrawable = useWithdrawable(linkedWallet);
  const [open, setOpen] = useState(false);
  const amount = withdrawable.data ?? 0n;
  if (amount === 0n && !open) return null;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="font-mono normal-case">
          <span className="text-signal-orange tabular">
            {formatEthValue(amount)}
          </span>
          <span className="font-clash uppercase">To withdraw</span>
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Withdraw to your wallet</DialogTitle>
          <DialogDescription>
            The contract owes you {formatEth(amount)} from rewards, deposits or
            cancelled listings. Withdrawing sends it all to your wallet.
          </DialogDescription>
        </DialogHeader>
        <WithdrawAction amount={amount} onDone={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}
