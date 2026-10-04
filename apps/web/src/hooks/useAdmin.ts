"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import type { Hash } from "viem";
import { useRoleHolders } from "@/hooks/useChainData";
import { useWallet } from "@/hooks/useWallet";
import {
  decideRoleAccess,
  type LogActionInput,
  type RoleAccess,
} from "@/lib/admin";
import {
  fetchAuditLog,
  fetchDisputes,
  fetchOverview,
  fetchStudents,
  logAdminAction,
  type StudentQuery,
} from "@/lib/admin-api";
import { getPublicClient, lostAndFound, ROLES } from "@/lib/contract";
import { ApiRequestError } from "@/lib/errors";
import type { TxRequest } from "@/lib/tx-flow";
import { useTxFlow } from "./useTxFlow";

/** Every admin console query key starts with this, so one invalidation refreshes them all. */
export const ADMIN_KEY = "admin";

export function useAdminDisputes() {
  return useQuery({
    queryKey: [ADMIN_KEY, "disputes"],
    queryFn: fetchDisputes,
    refetchInterval: 60_000,
  });
}

export function useAdminStudents(query: StudentQuery) {
  return useQuery({
    queryKey: [ADMIN_KEY, "students", query],
    queryFn: () => fetchStudents(query),
    placeholderData: (previous) => previous,
  });
}

export function useAuditLog(page: number) {
  return useQuery({
    queryKey: [ADMIN_KEY, "audit", page],
    queryFn: () => fetchAuditLog(page),
    placeholderData: (previous) => previous,
  });
}

export function useAdminOverview() {
  return useQuery({
    queryKey: [ADMIN_KEY, "overview"],
    queryFn: fetchOverview,
    refetchInterval: 60_000,
  });
}

export type ChainRole = "admin" | "arbiter";

/** Whether the connected wallet can send writes that need `role` (see `decideRoleAccess`). */
export function useRoleAccess(role: ChainRole): RoleAccess {
  const wallet = useWallet();
  const account = wallet.address;
  const holders = useRoleHolders();
  // If the RPC refused the role-history scan, carry on without it: `useTxFlow` still checks
  // `hasRole` before anything is sent.
  const list = holders.isError ? [] : (holders.data?.[role] ?? null);

  const contracts = useQuery({
    queryKey: ["role-contracts", role, list],
    queryFn: async () => {
      const client = getPublicClient();
      const codes = await Promise.all(
        list!.map((address) => client.getCode({ address })),
      );
      return list!.filter((_, index) => (codes[index] ?? "0x") !== "0x");
    },
    enabled: list !== null,
    staleTime: 5 * 60_000,
  });

  const holds = useQuery({
    queryKey: ["has-role", role, account],
    queryFn: () =>
      getPublicClient().readContract({
        address: lostAndFound.address,
        abi: lostAndFound.abi,
        functionName: "hasRole",
        args: [ROLES[role], account!],
      }),
    enabled: Boolean(account),
    staleTime: 60_000,
  });

  return decideRoleAccess({
    walletLoading: wallet.status === "loading",
    account,
    holders: list,
    contractHolders: contracts.isError ? [] : (contracts.data ?? null),
    holds: holds.isError ? true : (holds.data ?? null),
  });
}

/** Attempts before giving up on saving an audit entry (the server may lag the chain a block). */
const LOG_ATTEMPTS = 3;

/**
 * Saves a mined admin write to the audit log, retrying network and server errors, then
 * refreshes the console's lists. Resolves with an error message instead of throwing.
 */
export function useRecordAction() {
  const queryClient = useQueryClient();
  return useCallback(
    async (input: LogActionInput): Promise<{ error: string | null }> => {
      let message = "We couldn't save this to the audit log.";
      for (let attempt = 1; attempt <= LOG_ATTEMPTS; attempt++) {
        try {
          await logAdminAction(input);
          await queryClient.invalidateQueries({ queryKey: [ADMIN_KEY] });
          return { error: null };
        } catch (error) {
          if (error instanceof ApiRequestError) {
            message = error.message;
            // A refusal (bad note, wrong wallet) won't change on retry; "not mined yet" (409) might.
            if (
              error.status >= 400 &&
              error.status < 500 &&
              error.status !== 409
            )
              break;
          }
          if (attempt < LOG_ATTEMPTS)
            await new Promise((resolve) =>
              setTimeout(resolve, 2_000 * attempt),
            );
        }
      }
      return { error: message };
    },
    [queryClient],
  );
}

export type AuditSave =
  | { state: "saving" }
  | { state: "saved" }
  | { state: "failed"; error: string; input: LogActionInput }
  | null;

/**
 * One admin write: `useTxFlow` (wallet, chain, linked wallet, role, simulation, MetaMask,
 * receipt), then the audit log entry built from the mined transaction.
 */
export function useAdminWrite() {
  const flow = useTxFlow();
  const record = useRecordAction();
  const [save, setSave] = useState<AuditSave>(null);

  async function saveEntry(input: LogActionInput) {
    setSave({ state: "saving" });
    const { error } = await record(input);
    setSave(error ? { state: "failed", error, input } : { state: "saved" });
  }

  async function run(
    request: TxRequest,
    entry: (txHash: Hash) => LogActionInput,
  ) {
    setSave(null);
    const result = await flow.run(request);
    if (result.state === "confirmed" && result.hash)
      await saveEntry(entry(result.hash));
    return result;
  }

  return {
    flow,
    save,
    run,
    retrySave: () => {
      if (save?.state === "failed") void saveEntry(save.input);
    },
    reset: () => {
      flow.reset();
      setSave(null);
    },
    /** A write is running, or its audit entry is still being saved. */
    locked: flow.busy || save?.state === "saving" || save?.state === "failed",
  };
}

export type AdminWrite = ReturnType<typeof useAdminWrite>;
