"use client";

import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useCallback, useRef, useState } from "react";
import { getAddress, type Address } from "viem";
import { useConfig } from "wagmi";
import {
  estimateFeesPerGas,
  getBalance,
  getConnection,
  getPublicClient,
  simulateContract,
  switchChain,
  waitForTransactionReceipt,
  writeContract,
} from "wagmi/actions";
import { toastResult } from "@/components/tx/toast";
import { useLinkedWallet } from "@/hooks/useLinkedWallet";
import { appChain } from "@/lib/chain";
import { lostAndFound } from "@/lib/contract";
import {
  executeTx,
  IDLE_SNAPSHOT,
  type TxCall,
  type TxFlowDeps,
  type TxRequest,
  type TxSnapshot,
} from "@/lib/tx-flow";

/** How long to wait for a receipt before telling the student to check Etherscan. */
const RECEIPT_TIMEOUT_MS = 3 * 60_000;

/** React Query keys a confirmed write makes stale (PLAN.md Phase 8 step 5). */
export function txQueryKeys(itemId: bigint | undefined, account: Address) {
  return [
    ...(itemId !== undefined
      ? [
          ["item", itemId.toString()],
          ["item-history", itemId.toString()],
        ]
      : []),
    ["items"],
    ["me", account],
    // Prefix: our withdrawable `['balance', address]` and wagmi's wallet balance queries.
    ["balance"],
    ["stats"],
    ["contract-totals"],
    // Admin writes: pause state and settings. The admin console refreshes its own lists
    // once the action is in the audit log.
    ["contract-config"],
    ["chain-time-offset"],
  ] as const;
}

async function invalidateAfterTx(
  queryClient: QueryClient,
  itemId: bigint | undefined,
  account: Address,
) {
  await Promise.all(
    txQueryKeys(itemId, account).map((queryKey) =>
      queryClient.invalidateQueries({ queryKey }),
    ),
  );
}

/**
 * The contract call for wagmi and viem. `functionName` and `args` are checked by `TxCall`'s
 * union of write functions, not per function, so the result is cast where it's passed.
 */
function contractCall(call: TxCall & { account: Address }) {
  return {
    address: lostAndFound.address,
    abi: lostAndFound.abi,
    functionName: call.functionName,
    args: call.args,
    value: call.value,
    account: call.account,
    chainId: appChain.id,
  };
}

/**
 * Runs an on-chain write through `executeTx`: wallet, chain and linked-wallet checks, gas and
 * balance check, simulation, MetaMask, receipt. On success it toasts the past-tense message
 * and refreshes the affected queries.
 */
export function useTxFlow() {
  const config = useConfig();
  const queryClient = useQueryClient();
  const { wallet: linkedWallet } = useLinkedWallet();
  const [snapshot, setSnapshot] = useState<TxSnapshot>(IDLE_SNAPSHOT);
  const running = useRef(false);

  const run = useCallback(
    async (request: TxRequest): Promise<TxSnapshot> => {
      if (running.current) return snapshot;
      running.current = true;
      const deps: TxFlowDeps = {
        chainId: appChain.id,
        linkedWallet,
        getConnection: () => {
          const connection = getConnection(config);
          return {
            address: connection.address,
            chainId: connection.chainId,
          };
        },
        switchChain: (chainId) =>
          switchChain(config, { chainId: chainId as typeof appChain.id }),
        estimateGas: (call) =>
          getPublicClient(config, {
            chainId: appChain.id,
          }).estimateContractGas(contractCall(call) as never),
        maxFeePerGas: async () => {
          const fees = await estimateFeesPerGas(config, {
            chainId: appChain.id,
          });
          return fees.maxFeePerGas ?? fees.gasPrice ?? 0n;
        },
        getBalance: async (address) =>
          (await getBalance(config, { address, chainId: appChain.id })).value,
        hasRole: (role, account) =>
          getPublicClient(config, { chainId: appChain.id }).readContract({
            address: lostAndFound.address,
            abi: lostAndFound.abi,
            functionName: "hasRole",
            args: [role, account],
          }),
        simulate: async (call) =>
          (await simulateContract(config, contractCall(call) as never)).request,
        write: (request) => writeContract(config, request as never),
        waitForReceipt: (hash) =>
          waitForTransactionReceipt(config, {
            hash,
            chainId: appChain.id,
            timeout: RECEIPT_TIMEOUT_MS,
          }),
      };
      try {
        const result = await executeTx(deps, request, setSnapshot);
        if (result.state === "confirmed") {
          toastResult("success", request.successMessage);
          const account = deps.getConnection().address;
          if (account)
            await invalidateAfterTx(
              queryClient,
              request.itemId,
              getAddress(account),
            );
        } else if (result.state === "cancelled") {
          toastResult("cancelled", result.error ?? "Cancelled.");
        }
        return result;
      } finally {
        running.current = false;
      }
    },
    [config, linkedWallet, queryClient, snapshot],
  );

  const reset = useCallback(() => {
    if (!running.current) setSnapshot(IDLE_SNAPSHOT);
  }, []);

  return {
    ...snapshot,
    /** True from `checking` until a final state. */
    busy:
      snapshot.state === "checking" ||
      snapshot.state === "awaitingWallet" ||
      snapshot.state === "pending",
    run,
    reset,
  };
}

export type TxFlow = ReturnType<typeof useTxFlow>;
