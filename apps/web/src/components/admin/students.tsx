"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { SearchIcon } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { AddressChip } from "@/components/item/address-chip";
import { EmptyState } from "@/components/item/empty-state";
import { NodeDot } from "@/components/item/node-dot";
import type { NodeTone } from "@/components/item/status";
import { ConfirmDialog } from "@/components/tx/confirm-dialog";
import { toastResult } from "@/components/tx/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { ADMIN_KEY, useAdminStudents } from "@/hooks/useAdmin";
import { NOTE_MAX } from "@/lib/admin";
import {
  STUDENT_PAGE_SIZE,
  studentAction,
  type AdminStudent,
  type AdminStudentStatus,
} from "@/lib/admin-api";
import { Pager, Th } from "./parts";

export const STUDENT_STATUS_META: Record<
  AdminStudentStatus,
  { label: string; tone: NodeTone }
> = {
  verified: { label: "Verified", tone: "green" },
  pending: { label: "Pending", tone: "orange" },
  failed: { label: "Failed", tone: "magenta" },
  revoked: { label: "Revoked", tone: "steel" },
};

const STATUS_FILTERS = [
  "all",
  "verified",
  "pending",
  "failed",
  "revoked",
] as const;

/** Students tab (admins): search, status filter, revoke and retry. */
export function Students() {
  const searchId = useId();
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<AdminStudentStatus | "all">("all");
  const [page, setPage] = useState(1);

  // Search as you type, without a request per keystroke.
  useEffect(() => {
    const timer = setTimeout(() => {
      setQ(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const students = useAdminStudents({ q, status, page });
  const filtered = q.trim() !== "" || status !== "all";

  return (
    <section aria-labelledby="students-title" className="flex flex-col gap-24">
      <div className="flex flex-col gap-9">
        <h2 id="students-title" className="text-heading-sm">
          Students
        </h2>
        <p className="text-body text-cloud">
          Everyone who has started activation. Removing a student takes their
          wallet off the contract&apos;s list; items they already posted or
          claimed still finish.
        </p>
      </div>

      <div className="flex flex-col gap-12 sm:flex-row">
        <label htmlFor={searchId} className="sr-only">
          Search by email or wallet
        </label>
        <div className="relative flex-1">
          <SearchIcon
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-20 size-16 -translate-y-1/2 text-cloud"
          />
          <Input
            id={searchId}
            type="search"
            placeholder="Search by email or wallet"
            className="pl-48"
            value={search}
            maxLength={100}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <Select
          value={status}
          onValueChange={(value) => {
            setStatus(value as AdminStudentStatus | "all");
            setPage(1);
          }}
        >
          <SelectTrigger aria-label="Status" className="sm:w-200">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_FILTERS.map((value) => (
              <SelectItem key={value} value={value}>
                {value === "all" ? (
                  "All statuses"
                ) : (
                  <>
                    <NodeDot tone={STUDENT_STATUS_META[value].tone} />
                    {STUDENT_STATUS_META[value].label}
                  </>
                )}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {students.isPending ? (
        <TableSkeleton />
      ) : students.isError ? (
        <EmptyState
          title="We couldn't load the students."
          action={
            <Button variant="ghost" onClick={() => students.refetch()}>
              Try again
            </Button>
          }
        >
          {students.error.message}
        </EmptyState>
      ) : students.data.students.length === 0 ? (
        <EmptyState
          title={
            filtered ? "No students match." : "No students have signed up yet."
          }
          action={
            filtered ? (
              <Button
                variant="ghost"
                onClick={() => {
                  setSearch("");
                  setStatus("all");
                }}
              >
                Clear search
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          <div
            className="overflow-hidden rounded-card border border-charcoal bg-carbon"
            aria-busy={students.isFetching}
          >
            <table className="w-full text-left">
              <caption className="sr-only">
                Students, newest first. {students.data.total} in total.
              </caption>
              <thead className="hidden bg-obsidian md:table-header-group">
                <tr>
                  <Th>Email</Th>
                  <Th>Wallet</Th>
                  <Th>Status</Th>
                  <Th>Verified</Th>
                  <Th>
                    <span className="sr-only">Actions</span>
                  </Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-charcoal">
                {students.data.students.map((student) => (
                  <StudentRow key={student.clerkUserId} student={student} />
                ))}
              </tbody>
            </table>
          </div>
          <Pager
            page={students.data.page}
            pageSize={STUDENT_PAGE_SIZE}
            total={students.data.total}
            onPage={setPage}
            busy={students.isFetching}
          />
        </>
      )}
    </section>
  );
}

function TableSkeleton() {
  return (
    <div
      aria-label="Loading students"
      className="flex flex-col gap-16 rounded-card border border-charcoal bg-carbon p-24"
    >
      {[0, 1, 2].map((key) => (
        <div key={key} className="flex flex-wrap justify-between gap-16">
          <Skeleton className="h-16 w-200" />
          <Skeleton className="h-16 w-120" />
          <Skeleton className="h-16 w-96" />
        </div>
      ))}
    </div>
  );
}

function StudentRow({ student }: { student: AdminStudent }) {
  const meta = STUDENT_STATUS_META[student.status];
  return (
    <tr className="flex flex-col gap-9 px-24 py-16 md:table-row md:p-0">
      <td className="min-w-0 text-body-sm break-all text-white md:px-24 md:py-12">
        {student.email}
      </td>
      <td className="md:px-24 md:py-12">
        <AddressChip address={student.walletAddress} />
      </td>
      <td className="md:px-24 md:py-12">
        <span className="inline-flex items-center gap-7 font-mono text-caption text-snow uppercase">
          <NodeDot tone={meta.tone} />
          {meta.label}
        </span>
        {student.status === "failed" && student.error && (
          <p className="mt-4 max-w-240 text-caption text-cloud">
            {student.error}
          </p>
        )}
      </td>
      <td className="font-mono text-caption text-cloud uppercase tabular md:px-24 md:py-12">
        {student.verifiedAt ? (
          <time dateTime={student.verifiedAt}>
            {format(new Date(student.verifiedAt), "d MMM yyyy")}
          </time>
        ) : (
          <span aria-label="Not verified">—</span>
        )}
      </td>
      <td className="md:px-24 md:py-12">
        <div className="flex flex-wrap gap-9 md:justify-end">
          {(student.status === "failed" || student.status === "pending") && (
            <RetryButton student={student} />
          )}
          {student.status !== "revoked" && <RevokeButton student={student} />}
        </div>
      </td>
    </tr>
  );
}

function useStudentAction(action: "revoke" | "retry") {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, note }: { id: string; note?: string }) =>
      studentAction(id, action, note),
    onSuccess: async (result) => {
      toastResult(
        "success",
        action === "revoke"
          ? "Student removed"
          : result.status === "verified"
            ? "Student activated"
            : "Verification retried",
      );
      await queryClient.invalidateQueries({ queryKey: [ADMIN_KEY] });
    },
    onError: (error) => toastResult("error", error.message),
  });
}

function RetryButton({ student }: { student: AdminStudent }) {
  const retry = useStudentAction("retry");
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={retry.isPending}
      onClick={() => retry.mutate({ id: student.clerkUserId })}
    >
      {retry.isPending ? "Retrying…" : "Retry"}
    </Button>
  );
}

function RevokeButton({ student }: { student: AdminStudent }) {
  const revoke = useStudentAction("revoke");
  const noteId = useId();
  const [note, setNote] = useState("");
  return (
    <ConfirmDialog
      trigger={
        <Button variant="danger" size="sm" disabled={revoke.isPending}>
          {revoke.isPending ? "Removing…" : "Remove"}
        </Button>
      }
      title="Remove this student?"
      confirmLabel="Remove student"
      cancelLabel="Keep student"
      danger
      onConfirm={() =>
        revoke.mutate({
          id: student.clerkUserId,
          note: note.trim() || undefined,
        })
      }
    >
      <p>
        {student.email} won&apos;t be able to post or claim. Their wallet is
        taken off the contract&apos;s list by the verifier wallet; items they
        already posted or claimed still finish.
      </p>
      <label htmlFor={noteId} className="flex flex-col gap-7">
        <span className="text-body-sm text-white">Note (optional)</span>
        <Textarea
          id={noteId}
          value={note}
          maxLength={NOTE_MAX}
          className="min-h-64"
          onChange={(event) => setNote(event.target.value)}
        />
      </label>
    </ConfirmDialog>
  );
}
