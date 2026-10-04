import { ITEM_STATUSES, type Item } from "@milgaya/shared";
import { getAddress, isAddress, type Address, type Hash } from "viem";
import { z } from "zod";
import type { LogActionInput } from "./admin";
import { apiFetch } from "./errors";

/**
 * The admin console's calls to `/api/admin/*`, with every response validated by zod and wei
 * strings turned back into bigint.
 */

const address = z
  .string()
  .refine((value) => isAddress(value, { strict: false }), "Not an address.")
  .transform((value) => getAddress(value));
const wei = z
  .string()
  .regex(/^\d+$/)
  .transform((value) => BigInt(value));
const hash = z
  .string()
  .regex(/^0x[0-9a-fA-F]{64}$/)
  .transform((value) => value as Hash);
const timestamp = z.string().nullable();

const itemSchema = z.object({
  id: wei,
  owner: address,
  status: z.enum(ITEM_STATUSES).exclude(["None"]),
  createdAt: wei,
  finder: address.nullable(),
  claimedAt: wei.nullable(),
  claimWindow: wei,
  reward: wei,
  stake: wei,
  metadataCID: z.string(),
});

const disputesSchema = z.object({
  disputes: z.array(
    z.object({
      item: itemSchema,
      ownerEmail: z.string().nullable(),
      finderEmail: z.string().nullable(),
    }),
  ),
});

export interface AdminDispute {
  item: Item;
  ownerEmail: string | null;
  finderEmail: string | null;
}

export async function fetchDisputes(): Promise<AdminDispute[]> {
  return disputesSchema.parse(await apiFetch("/api/admin/disputes")).disputes;
}

/**
 * The open disputes plus any the console still holds: resolved on-chain but with the
 * decision's audit entry not yet saved, so the card and its retry stay on screen.
 */
export function withHeldDisputes(
  open: AdminDispute[],
  held: AdminDispute[],
): AdminDispute[] {
  const missing = held.filter(
    (dispute) => !open.some((other) => other.item.id === dispute.item.id),
  );
  return [...missing, ...open];
}

const STUDENT_STATUSES = ["pending", "verified", "failed", "revoked"] as const;
export type AdminStudentStatus = (typeof STUDENT_STATUSES)[number];

const studentSchema = z.object({
  clerkUserId: z.string(),
  email: z.string(),
  walletAddress: address,
  status: z.enum(STUDENT_STATUSES),
  verifyTxHash: z.string().nullable(),
  error: z.string().nullable(),
  createdAt: z.string(),
  verifiedAt: timestamp,
  revokedAt: timestamp,
});

export type AdminStudent = z.output<typeof studentSchema>;

const studentsSchema = z.object({
  students: z.array(studentSchema),
  page: z.number(),
  pageSize: z.number(),
  total: z.number(),
});

export type StudentPage = z.output<typeof studentsSchema>;

export interface StudentQuery {
  q: string;
  status: AdminStudentStatus | "all";
  page: number;
}

export const STUDENT_PAGE_SIZE = 25;

export async function fetchStudents(query: StudentQuery): Promise<StudentPage> {
  const params = new URLSearchParams({
    page: String(query.page),
    pageSize: String(STUDENT_PAGE_SIZE),
  });
  if (query.q.trim()) params.set("q", query.q.trim());
  if (query.status !== "all") params.set("status", query.status);
  return studentsSchema.parse(await apiFetch(`/api/admin/students?${params}`));
}

const studentResultSchema = z.object({
  status: z.string(),
  txHash: hash.nullable(),
});

/** Revokes or retries one student. The verifier wallet sends the transaction from the server. */
export async function studentAction(
  clerkUserId: string,
  action: "revoke" | "retry",
  note?: string,
): Promise<z.output<typeof studentResultSchema>> {
  return studentResultSchema.parse(
    await apiFetch(
      `/api/admin/students/${encodeURIComponent(clerkUserId)}/${action}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(note ? { note } : {}),
      },
    ),
  );
}

const auditRowSchema = z.object({
  id: z.number(),
  actorClerkId: z.string(),
  actorEmail: z.string().nullable(),
  action: z.string(),
  target: z.string(),
  targetEmail: z.string().nullable(),
  txHash: hash.nullable(),
  note: z.string().nullable(),
  createdAt: z.string(),
});

export type AuditRow = z.output<typeof auditRowSchema>;

const auditPageSchema = z.object({
  actions: z.array(auditRowSchema),
  page: z.number(),
  pageSize: z.number(),
  total: z.number(),
});

export const AUDIT_PAGE_SIZE = 25;

export async function fetchAuditLog(
  page: number,
): Promise<z.output<typeof auditPageSchema>> {
  return auditPageSchema.parse(
    await apiFetch(
      `/api/admin/actions?page=${page}&pageSize=${AUDIT_PAGE_SIZE}`,
    ),
  );
}

/** Records a mined admin write in the audit log; the server checks the receipt first. */
export async function logAdminAction(input: LogActionInput): Promise<void> {
  await apiFetch("/api/admin/actions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
}

const overviewSchema = z.object({
  verifier: z.object({ address, balance: wei }),
  students: z.record(z.enum(STUDENT_STATUSES), z.number()),
});

export interface AdminOverview {
  verifier: { address: Address; balance: bigint };
  students: Record<AdminStudentStatus, number>;
}

export async function fetchOverview(): Promise<AdminOverview> {
  return overviewSchema.parse(await apiFetch("/api/admin/overview"));
}
