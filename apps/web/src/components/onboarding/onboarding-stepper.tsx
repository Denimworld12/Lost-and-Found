"use client";

import { useSession, useUser } from "@clerk/nextjs";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckIcon, ExternalLinkIcon } from "lucide-react";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import type { Address, Hash } from "viem";
import { useAccount, useConnect, useConnectors, useSignMessage } from "wagmi";
import { AddressChip } from "@/components/item/address-chip";
import { NodeDot } from "@/components/item/node-dot";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useIsClient } from "@/hooks/useIsClient";
import { txUrl } from "@/lib/chain";
import {
  apiFetch,
  isUserRejection,
  linkWalletErrorMessage,
} from "@/lib/errors";
import { formatEth, shortAddress } from "@/lib/format";
import {
  currentStep,
  deriveSteps,
  MIN_GAS_WEI,
  onboardingStatusSchema,
  type OnboardingStatus,
  type StepId,
} from "@/lib/onboarding";
import { cn } from "@/lib/utils";

const STATUS_KEY = ["onboarding-status"] as const;
const POLL_MS = 4_000;

const FAUCETS = [
  {
    label: "Google Cloud faucet",
    href: "https://cloud.google.com/application/web3/faucet/ethereum/sepolia",
  },
  {
    label: "Alchemy faucet",
    href: "https://www.alchemy.com/faucets/ethereum-sepolia",
  },
] as const;

async function fetchStatus(): Promise<OnboardingStatus> {
  return onboardingStatusSchema.parse(
    await apiFetch("/api/onboarding/status", { cache: "no-store" }),
  );
}

/**
 * The five-step setup from docs/UI_SPEC.md → Onboarding, driven by `/api/onboarding/status`.
 * Every step's "done" comes from the server (or the wallet connection), so a refresh resumes
 * at the right step.
 */
export function OnboardingStepper() {
  const queryClient = useQueryClient();
  const { isConnected } = useAccount();
  const [activating, setActivating] = useState(false);

  const status = useQuery({
    queryKey: STATUS_KEY,
    queryFn: fetchStatus,
    staleTime: 0,
    refetchInterval: (query) => {
      const data = query.state.data;
      return activating || data?.studentStatus === "pending" ? POLL_MS : false;
    },
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: STATUS_KEY });

  if (status.isPending) return <StepperSkeleton />;
  if (status.isError) {
    return (
      <div
        role="alert"
        className="flex flex-col items-start gap-16 rounded-card border border-charcoal bg-carbon p-24"
      >
        <p className="flex items-center gap-9 text-body text-snow">
          <NodeDot tone="magenta" />
          {status.error.message}
        </p>
        <Button variant="ghost" onClick={() => status.refetch()}>
          Try again
        </Button>
      </div>
    );
  }

  const data = status.data;
  const steps = deriveSteps(data, isConnected);
  const current = currentStep(steps);
  const done = (id: StepId) =>
    steps.find((step) => step.id === id)?.done ?? false;

  if (current === null) return <AllSet />;

  return (
    <ol className="flex flex-col gap-12">
      <Step
        number={1}
        title="College account"
        state={stepState("college", current, done)}
        summary={data.email}
      >
        <p className="text-body-sm text-cloud">
          Your email{" "}
          {data.email ? <span className="text-snow">{data.email}</span> : null}{" "}
          isn&apos;t a verified college address. Sign in with your college
          Google account.
        </p>
      </Step>

      <Step
        number={2}
        title="Connect MetaMask"
        state={stepState("connect", current, done)}
        summary={data.wallet ? shortAddress(data.wallet) : "Connected"}
      >
        <ConnectStep />
      </Step>

      <Step
        number={3}
        title="Link wallet to your account"
        state={stepState("link", current, done)}
        summary={data.wallet ? shortAddress(data.wallet) : null}
      >
        <LinkStep multipleWallets={data.multipleWallets} onLinked={refresh} />
      </Step>

      <Step
        number={4}
        title="Get test ETH"
        state={stepState("gas", current, done)}
        summary={data.balance ? formatEth(BigInt(data.balance)) : null}
      >
        <GasStep
          wallet={data.wallet as Address | null}
          balance={data.balance}
          checking={status.isFetching}
          onCheck={() => status.refetch()}
        />
      </Step>

      <Step
        number={5}
        title="Activate"
        state={stepState("activate", current, done)}
        summary={null}
      >
        <ActivateStep
          status={data}
          onActivatingChange={setActivating}
          onActivated={refresh}
        />
      </Step>
    </ol>
  );
}

type StepVisualState = "done" | "current" | "upcoming";

function stepState(
  id: StepId,
  current: StepId,
  done: (id: StepId) => boolean,
): StepVisualState {
  if (id === current) return "current";
  return done(id) ? "done" : "upcoming";
}

function Step({
  number,
  title,
  state,
  summary,
  children,
}: {
  number: number;
  title: string;
  state: StepVisualState;
  summary: ReactNode;
  children: ReactNode;
}) {
  return (
    <li
      aria-current={state === "current" ? "step" : undefined}
      className={cn(
        "rounded-card border bg-carbon px-24",
        state === "current" ? "border-steel py-24" : "border-charcoal py-16",
      )}
    >
      <div className="flex flex-wrap items-center gap-x-12 gap-y-4">
        <StepMarker state={state} />
        <h2
          className={cn(
            "font-clash text-body font-medium tracking-clash md:text-subheading",
            state === "upcoming" ? "text-cloud" : "text-white",
          )}
        >
          <span className="tabular">{number}</span> {title}
        </h2>
        {state === "done" && summary ? (
          <span className="ml-auto truncate font-mono text-body-sm text-cloud">
            {summary}
          </span>
        ) : null}
        <span className="sr-only">
          {state === "done"
            ? "Done"
            : state === "current"
              ? "Current step"
              : "Not started"}
        </span>
      </div>
      {state === "current" ? (
        <div className="mt-16 flex flex-col gap-16 md:pl-32">{children}</div>
      ) : null}
    </li>
  );
}

function StepMarker({ state }: { state: StepVisualState }) {
  if (state === "done") {
    return (
      <span
        className="inline-flex size-20 items-center justify-center"
        aria-hidden="true"
      >
        <CheckIcon className="size-20 text-white" />
      </span>
    );
  }
  return (
    <span
      className="inline-flex size-20 items-center justify-center"
      aria-hidden="true"
    >
      {state === "current" ? (
        <NodeDot tone="orange" size={10} />
      ) : (
        <span className="size-10 rounded-badge border border-steel" />
      )}
    </span>
  );
}

function InlineError({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="flex items-start gap-9 text-body-sm text-snow">
      <NodeDot tone="magenta" className="mt-5" />
      <span>{children}</span>
    </p>
  );
}

function Note({ children }: { children: ReactNode }) {
  return <p className="text-body-sm text-cloud">{children}</p>;
}

// ─────────────────────────────────────────────────────────────── Step 2

function ConnectStep() {
  const isClient = useIsClient();
  const connectors = useConnectors();
  const connect = useConnect();
  const [error, setError] = useState<string | null>(null);

  const hasProvider =
    isClient &&
    typeof window !== "undefined" &&
    "ethereum" in window &&
    Boolean(window.ethereum);
  const deepLink = isClient
    ? `https://metamask.app.link/dapp/${window.location.host}${window.location.pathname}`
    : "https://metamask.app.link";

  async function onConnect() {
    setError(null);
    const connector = connectors[0];
    if (!connector) return;
    try {
      await connect.mutateAsync({ connector });
    } catch (cause) {
      if (!isUserRejection(cause)) {
        setError("MetaMask didn't connect. Unlock it and try again.");
      }
    }
  }

  return (
    <>
      <div className="flex flex-wrap gap-12">
        {hasProvider || !isClient ? (
          <Button onClick={onConnect} disabled={!isClient || connect.isPending}>
            {connect.isPending ? "Connecting…" : "Connect MetaMask"}
          </Button>
        ) : (
          <Button asChild>
            <a
              href="https://metamask.io/download/"
              target="_blank"
              rel="noreferrer"
            >
              Install MetaMask
            </a>
          </Button>
        )}
      </div>
      <Note>
        No MetaMask?{" "}
        <a
          href="https://metamask.io/download/"
          target="_blank"
          rel="noreferrer"
          className="text-snow underline underline-offset-4 hover:text-white"
        >
          Install it
        </a>{" "}
        · On a phone?{" "}
        <a
          href={deepLink}
          className="text-snow underline underline-offset-4 hover:text-white"
        >
          Open in MetaMask app
        </a>
      </Note>
      {error ? <InlineError>{error}</InlineError> : null}
    </>
  );
}

// ─────────────────────────────────────────────────────────────── Step 3

function LinkStep({
  multipleWallets,
  onLinked,
}: {
  multipleWallets: boolean;
  onLinked: () => void;
}) {
  const { user } = useUser();
  const { address } = useAccount();
  const signMessage = useSignMessage();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cancelled, setCancelled] = useState(false);

  async function onLink() {
    if (!user || !address) return;
    setBusy(true);
    setError(null);
    setCancelled(false);
    try {
      // Reuse an unverified entry left by an earlier cancelled attempt.
      const existing = user.web3Wallets.find(
        (wallet) => wallet.web3Wallet.toLowerCase() === address.toLowerCase(),
      );
      const wallet =
        existing ?? (await user.createWeb3Wallet({ web3Wallet: address }));
      const prepared = await wallet.prepareVerification({
        strategy: "web3_metamask_signature",
      });
      const message = prepared.verification.message;
      if (!message) throw new Error("No message to sign");
      const signature = await signMessage.mutateAsync({
        account: address,
        message,
      });
      await prepared.attemptVerification({ signature });
      await user.reload();
      onLinked();
    } catch (cause) {
      if (isUserRejection(cause)) setCancelled(true);
      else setError(linkWalletErrorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  if (multipleWallets) {
    return (
      <InlineError>
        More than one wallet is linked to your account. Open your account menu
        (top right), remove the one you don&apos;t want, then come back.
      </InlineError>
    );
  }

  return (
    <>
      <Note>
        Sign a free message to prove it&apos;s yours. No gas, no transaction.
      </Note>
      {address ? (
        <p className="font-mono text-body-sm text-snow">
          Wallet <span className="tabular">{shortAddress(address)}</span>
        </p>
      ) : null}
      <div className="flex flex-wrap gap-12">
        <Button onClick={onLink} disabled={busy || !address || !user}>
          {busy ? "Waiting for signature…" : "Link this wallet"}
        </Button>
      </div>
      {cancelled ? (
        <Note>
          Signature cancelled. Link the wallet when you&apos;re ready.
        </Note>
      ) : null}
      {error ? <InlineError>{error}</InlineError> : null}
    </>
  );
}

// ─────────────────────────────────────────────────────────────── Step 4

function GasStep({
  wallet,
  balance,
  checking,
  onCheck,
}: {
  wallet: Address | null;
  balance: string | null;
  checking: boolean;
  onCheck: () => void;
}) {
  return (
    <>
      <Note>
        Posting and claiming cost a little gas, paid in test ETH (free, no real
        value). You need at least {formatEth(MIN_GAS_WEI)}.
      </Note>
      <p className="font-mono text-body-sm text-snow" aria-live="polite">
        Balance{" "}
        <span className="tabular">{formatEth(BigInt(balance ?? "0"))}</span>
      </p>
      {wallet ? (
        <div className="flex flex-wrap items-center gap-9 text-body-sm text-cloud">
          Paste this address into the faucet: <AddressChip address={wallet} />
        </div>
      ) : null}
      <div className="flex flex-wrap gap-12">
        <Button asChild>
          <a href={FAUCETS[0].href} target="_blank" rel="noreferrer">
            Open faucet
          </a>
        </Button>
        <Button variant="ghost" onClick={onCheck} disabled={checking}>
          {checking ? "Checking…" : "Check again"}
        </Button>
      </div>
      <Note>
        Faucet empty? Try the{" "}
        <a
          href={FAUCETS[1].href}
          target="_blank"
          rel="noreferrer"
          className="text-snow underline underline-offset-4 hover:text-white"
        >
          {FAUCETS[1].label}
        </a>
        .
      </Note>
    </>
  );
}

// ─────────────────────────────────────────────────────────────── Step 5

function ActivateStep({
  status,
  onActivatingChange,
  onActivated,
}: {
  status: OnboardingStatus;
  onActivatingChange: (activating: boolean) => void;
  onActivated: () => void;
}) {
  const { user } = useUser();
  const { session } = useSession();
  const activate = useMutation({
    mutationFn: () =>
      apiFetch("/api/onboarding/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      }),
    onMutate: () => onActivatingChange(true),
    onSettled: () => onActivatingChange(false),
    onSuccess: async () => {
      // Pick up the new metadata now so the proxy and header see `onchainVerified` at once.
      await Promise.allSettled([
        user?.reload(),
        session?.getToken({ skipCache: true }),
      ]);
      onActivated();
    },
  });

  if (status.studentStatus === "revoked") {
    return (
      <InlineError>
        Your access was removed by an admin. Contact campus security if you
        think this is a mistake.
      </InlineError>
    );
  }

  const pending = activate.isPending || status.studentStatus === "pending";
  const hash = status.verifyTxHash as Hash | null;
  const explorer = hash ? txUrl(hash) : null;
  const error =
    activate.error?.message ??
    (status.studentStatus === "failed" ? status.error : null);

  return (
    <>
      <Note>We add your wallet to the student list on the blockchain.</Note>
      {pending ? (
        <div aria-live="polite" className="flex flex-col gap-9">
          <p className="flex items-center gap-9 font-mono text-body-sm text-snow uppercase">
            <NodeDot tone="orange" />
            Pending
          </p>
          <Note>
            This usually takes under a minute. You can leave this page; it will
            finish.
          </Note>
          {explorer ? (
            <a
              href={explorer}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-4 font-mono text-body-sm text-snow underline underline-offset-4 hover:text-white"
            >
              View on Etherscan{" "}
              <ExternalLinkIcon aria-hidden="true" className="size-14" />
            </a>
          ) : null}
        </div>
      ) : null}
      {!activate.isPending ? (
        <div className="flex flex-wrap gap-12">
          <Button onClick={() => activate.mutate()}>
            {error ? "Try again" : "Activate my account"}
          </Button>
        </div>
      ) : null}
      {error && !activate.isPending ? <InlineError>{error}</InlineError> : null}
    </>
  );
}

// ─────────────────────────────────────────────────────────────── States

function AllSet() {
  return (
    <div className="flex flex-col items-start gap-20 rounded-card border border-charcoal bg-carbon p-24">
      <p className="flex items-center gap-12 font-clash text-subheading font-medium tracking-clash text-white">
        <NodeDot tone="green" size={10} />
        You&apos;re all set.
      </p>
      <p className="text-body-sm text-cloud">
        Your wallet is on the student list. You can post lost items and claim
        found ones.
      </p>
      <div className="flex flex-wrap gap-12">
        <Button asChild>
          <Link href="/post">Report lost item</Link>
        </Button>
        <Button asChild variant="ghost">
          <Link href="/items">Browse items</Link>
        </Button>
      </div>
    </div>
  );
}

function StepperSkeleton() {
  return (
    <div
      className="flex flex-col gap-12"
      aria-busy="true"
      aria-label="Loading your setup"
    >
      {[0, 1, 2, 3, 4].map((index) => (
        <Skeleton
          key={index}
          className={cn("rounded-card", index === 0 ? "h-120" : "h-56")}
        />
      ))}
    </div>
  );
}
