"use client";

import { useId, useState } from "react";
import { EmptyState } from "@/components/item/empty-state";
import { EthAmount } from "@/components/item/reward-amount";
import { ConfirmDialog } from "@/components/tx/confirm-dialog";
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
import { useAdminWrite } from "@/hooks/useAdmin";
import { useContractConfig } from "@/hooks/useChainData";
import {
  CONFIG_BOUNDS,
  describeConfig,
  NOTE_MAX,
  parseConfigForm,
  sameConfig,
  toConfigForm,
  WINDOW_UNITS,
  type AdminCall,
  type ConfigField,
  type ConfigForm,
  type ConfigValues,
  type WindowUnit,
} from "@/lib/admin";
import { ROLES, type ContractConfig } from "@/lib/contract";
import { formatDuration } from "@/lib/format";
import {
  AdminTxStatus,
  describedBy,
  Field,
  RoleGate,
  SafeProposal,
} from "./parts";

const ADMIN_ROLE = { role: ROLES.admin, label: "admin" };

/** Settings tab (admins): the contract's config and the pause switch. */
export function Settings() {
  const config = useContractConfig();

  return (
    <div className="flex flex-col gap-32">
      <div className="flex flex-col gap-9">
        <h2 className="text-heading-sm">Settings</h2>
        <p className="text-body text-cloud">
          Changes are contract transactions sent from the admin wallet. They
          apply to new posts and claims; existing items keep their reward,
          deposit and window.
        </p>
      </div>
      {config.isPending ? (
        <Skeleton className="h-320 w-full rounded-card" />
      ) : config.isError ? (
        <EmptyState
          title="We couldn't read the contract settings."
          action={
            <Button variant="ghost" onClick={() => config.refetch()}>
              Try again
            </Button>
          }
        />
      ) : (
        <>
          <ConfigSection current={config.data} />
          <PauseSection paused={config.data.paused} />
        </>
      )}
    </div>
  );
}

function ConfigSection({ current }: { current: ContractConfig }) {
  const write = useAdminWrite();
  const ids = {
    minReward: useId(),
    claimStake: useId(),
    confirmWindow: useId(),
    note: useId(),
  };
  const [form, setForm] = useState<ConfigForm>(() => toConfigForm(current));
  const [note, setNote] = useState("");
  const [showErrors, setShowErrors] = useState(false);
  const [confirming, setConfirming] = useState<{
    values: ConfigValues;
    mode: "direct" | "safe";
  } | null>(null);
  const [proposal, setProposal] = useState<AdminCall | null>(null);

  const parsed = parseConfigForm(form);
  const errors: Partial<Record<ConfigField, string>> =
    showErrors && "errors" in parsed ? parsed.errors : {};
  const values = "values" in parsed ? parsed.values : null;
  const unchanged = values !== null && sameConfig(values, current);

  function update<K extends keyof ConfigForm>(key: K, value: ConfigForm[K]) {
    setForm((previous) => ({ ...previous, [key]: value }));
  }

  function review(mode: "direct" | "safe") {
    setShowErrors(true);
    if (!values || unchanged) return;
    setConfirming({ values, mode });
  }

  async function save() {
    if (!confirming) return;
    const { values: next, mode } = confirming;
    setConfirming(null);
    const args = [next.minReward, next.claimStake, next.confirmWindow] as const;
    if (mode === "safe") {
      setProposal({ functionName: "setConfig", args });
      return;
    }
    await write.run(
      {
        functionName: "setConfig",
        args,
        successMessage: "Settings saved",
        requiredRole: ADMIN_ROLE,
      },
      (txHash) => ({
        action: "set_config",
        txHash,
        note: note.trim() || undefined,
      }),
    );
  }

  const locked = write.locked || write.flow.state === "confirmed";

  return (
    <section
      aria-labelledby="config-title"
      className="flex flex-col gap-24 rounded-card border border-charcoal bg-carbon p-24"
    >
      <h3 id="config-title" className="text-subheading">
        Rewards, deposits and the response window
      </h3>

      <div className="grid gap-24 md:grid-cols-3">
        <Field
          id={ids.minReward}
          label="Minimum reward (ETH)"
          error={errors.minReward}
          hint={
            <>
              Now <EthAmount wei={current.minReward} />. Allowed: more than 0.
            </>
          }
        >
          <Input
            id={ids.minReward}
            inputMode="decimal"
            autoComplete="off"
            value={form.minReward}
            disabled={locked}
            aria-invalid={errors.minReward ? true : undefined}
            aria-describedby={describedBy(
              ids.minReward,
              errors.minReward,
              true,
            )}
            onChange={(event) => update("minReward", event.target.value)}
          />
        </Field>
        <Field
          id={ids.claimStake}
          label="Finder's deposit (ETH)"
          error={errors.claimStake}
          hint={
            <>
              Now <EthAmount wei={current.claimStake} />. Allowed: more than 0.
            </>
          }
        >
          <Input
            id={ids.claimStake}
            inputMode="decimal"
            autoComplete="off"
            value={form.claimStake}
            disabled={locked}
            aria-invalid={errors.claimStake ? true : undefined}
            aria-describedby={describedBy(
              ids.claimStake,
              errors.claimStake,
              true,
            )}
            onChange={(event) => update("claimStake", event.target.value)}
          />
        </Field>
        <Field
          id={ids.confirmWindow}
          label="Owner's response window"
          error={errors.confirmWindow}
          hint={`Now ${formatDuration(current.confirmWindow)}. Allowed: ${formatDuration(CONFIG_BOUNDS.minWindow)} to ${formatDuration(CONFIG_BOUNDS.maxWindow)}.`}
        >
          <div className="flex gap-9">
            <Input
              id={ids.confirmWindow}
              inputMode="numeric"
              autoComplete="off"
              className="min-w-0 flex-1"
              value={form.windowValue}
              disabled={locked}
              aria-invalid={errors.confirmWindow ? true : undefined}
              aria-describedby={describedBy(
                ids.confirmWindow,
                errors.confirmWindow,
                true,
              )}
              onChange={(event) => update("windowValue", event.target.value)}
            />
            <Select
              value={form.windowUnit}
              disabled={locked}
              onValueChange={(value) =>
                update("windowUnit", value as WindowUnit)
              }
            >
              <SelectTrigger aria-label="Window unit" className="w-128">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(WINDOW_UNITS) as WindowUnit[]).map((unit) => (
                  <SelectItem key={unit} value={unit}>
                    {unit[0].toUpperCase() + unit.slice(1)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </Field>
      </div>

      <div
        aria-live="polite"
        className="flex flex-col gap-7 rounded-card border border-charcoal px-16 py-12"
      >
        <p className="font-mono text-caption text-cloud uppercase">Preview</p>
        {values ? (
          <ul className="flex flex-col gap-4 text-body-sm text-snow">
            {describeConfig(values).map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        ) : (
          <p className="text-body-sm text-cloud">
            Fix the highlighted values to see what changes.
          </p>
        )}
      </div>

      <Field
        id={ids.note}
        label="Note (optional)"
        hint="Why you're changing this. Saved to the audit log."
      >
        <Textarea
          id={ids.note}
          value={note}
          maxLength={NOTE_MAX}
          disabled={locked}
          className="min-h-64"
          aria-describedby={`${ids.note}-hint`}
          onChange={(event) => setNote(event.target.value)}
        />
      </Field>

      {proposal ? (
        <SafeProposal
          role="admin"
          call={proposal}
          onBack={() => setProposal(null)}
        />
      ) : write.flow.state !== "idle" ? (
        <AdminTxStatus
          write={write}
          title="Saving the settings"
          onDone={() => {
            write.reset();
            setForm(toConfigForm(current));
            setNote("");
            setShowErrors(false);
          }}
        />
      ) : (
        <RoleGate role="admin">
          {(mode) => (
            <div className="flex flex-col gap-9">
              <Button
                className="w-fit"
                onClick={() => review(mode)}
                disabled={unchanged}
              >
                {mode === "safe" ? "Propose in Safe" : "Save settings"}
              </Button>
              {unchanged && (
                <p className="text-caption text-cloud">
                  Change a value to save.
                </p>
              )}
            </div>
          )}
        </RoleGate>
      )}

      <ConfirmDialog
        open={confirming !== null}
        onOpenChange={(open) => {
          if (!open) setConfirming(null);
        }}
        title="Change the settings?"
        confirmLabel={
          confirming?.mode === "safe" ? "Propose in Safe" : "Save settings"
        }
        onConfirm={save}
      >
        {confirming && (
          <ul className="flex flex-col gap-4">
            {describeConfig(confirming.values).map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        )}
        <p>
          Items already posted or claimed keep their reward, deposit and window.
        </p>
      </ConfirmDialog>
    </section>
  );
}

function PauseSection({ paused }: { paused: boolean }) {
  const write = useAdminWrite();
  const ids = { note: useId(), typed: useId() };
  const [note, setNote] = useState("");
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"direct" | "safe">("direct");
  const [typed, setTyped] = useState("");
  const [proposal, setProposal] = useState<AdminCall | null>(null);
  const action = paused ? "unpause" : "pause";
  // The prop flips once the change is mined; keep describing the write that ran.
  const [running, setRunning] = useState<"pause" | "unpause">(action);

  function start(nextMode: "direct" | "safe") {
    setMode(nextMode);
    setTyped("");
    setOpen(true);
  }

  async function confirm() {
    setOpen(false);
    setRunning(action);
    if (mode === "safe") {
      setProposal({ functionName: action, args: [] });
      return;
    }
    await write.run(
      {
        functionName: action,
        args: [],
        successMessage: paused ? "Posting resumed" : "Posting paused",
        requiredRole: ADMIN_ROLE,
      },
      (txHash) => ({ action, txHash, note: note.trim() || undefined }),
    );
  }

  const locked = write.locked || write.flow.state === "confirmed";

  return (
    <section
      aria-labelledby="pause-title"
      className="flex flex-col gap-24 rounded-card border border-charcoal bg-carbon p-24"
    >
      <div className="flex flex-col gap-9">
        <h3 id="pause-title" className="text-subheading">
          {paused ? "Posting and claiming are paused" : "Pause the app"}
        </h3>
        <p className="text-body-sm text-cloud">
          {paused
            ? "Nobody can post or claim until you resume. Returns, disputes, collecting and withdrawals still work."
            : "Stops new posts and claims, for example during an incident. Returns, disputes, collecting and withdrawals keep working, so nobody's money gets stuck."}
        </p>
      </div>

      <Field
        id={ids.note}
        label="Note (optional)"
        hint="Why you're doing this. Saved to the audit log."
      >
        <Textarea
          id={ids.note}
          value={note}
          maxLength={NOTE_MAX}
          disabled={locked}
          className="min-h-64"
          aria-describedby={`${ids.note}-hint`}
          onChange={(event) => setNote(event.target.value)}
        />
      </Field>

      {proposal ? (
        <SafeProposal
          role="admin"
          call={proposal}
          onBack={() => setProposal(null)}
        />
      ) : write.flow.state !== "idle" ? (
        <AdminTxStatus
          write={write}
          title={
            running === "pause"
              ? "Pausing posting and claiming"
              : "Resuming posting and claiming"
          }
          onDone={() => {
            write.reset();
            setNote("");
          }}
        />
      ) : (
        <RoleGate role="admin">
          {(gateMode) =>
            paused ? (
              <Button className="w-fit" onClick={() => start(gateMode)}>
                {gateMode === "safe"
                  ? "Propose resume in Safe"
                  : "Resume posting and claiming"}
              </Button>
            ) : (
              <Button
                variant="danger"
                className="w-fit"
                onClick={() => start(gateMode)}
              >
                {gateMode === "safe"
                  ? "Propose pause in Safe"
                  : "Pause posting and claiming"}
              </Button>
            )
          }
        </RoleGate>
      )}

      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={
          paused
            ? "Resume posting and claiming?"
            : "Pause posting and claiming?"
        }
        confirmLabel={
          mode === "safe"
            ? "Propose in Safe"
            : paused
              ? "Resume posting and claiming"
              : "Pause posting and claiming"
        }
        danger={!paused}
        confirmDisabled={!paused && typed !== "PAUSE"}
        onConfirm={confirm}
      >
        {paused ? (
          <p>Students can post and claim again straight away.</p>
        ) : (
          <>
            <p>
              Students won&apos;t be able to post or claim until an admin
              resumes. Everything else keeps working.
            </p>
            <label htmlFor={ids.typed} className="flex flex-col gap-7">
              <span className="text-body-sm text-white">
                Type PAUSE to confirm
              </span>
              <Input
                id={ids.typed}
                value={typed}
                autoComplete="off"
                spellCheck={false}
                onChange={(event) => setTyped(event.target.value)}
              />
            </label>
          </>
        )}
      </ConfirmDialog>
    </section>
  );
}
