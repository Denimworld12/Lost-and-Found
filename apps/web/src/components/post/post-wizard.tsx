"use client";

import { CATEGORIES, type Item } from "@clf/shared";
import { CameraIcon, ImageIcon, TriangleAlertIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { parseEventLogs, zeroAddress } from "viem";
import { useBalance } from "wagmi";
import { z } from "zod";
import { ItemCard } from "@/components/item/item-card";
import { NodeDot } from "@/components/item/node-dot";
import { CATEGORY_TONE } from "@/components/item/status";
import { TxPanel } from "@/components/tx/tx-panel";
import { WalletGate } from "@/components/tx/wallet-gate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useContractConfig } from "@/hooks/useChainData";
import { useTxFlow } from "@/hooks/useTxFlow";
import { useWallet } from "@/hooks/useWallet";
import { appChain } from "@/lib/chain";
import { compressPhoto, PhotoError } from "@/lib/compress-image";
import { lostAndFound } from "@/lib/contract";
import { apiFetch } from "@/lib/errors";
import { formatDay, formatEth, formatEthValue } from "@/lib/format";
import type { ItemMetadata } from "@/lib/ipfs";
import {
  detailErrors,
  EMPTY_POST_FORM,
  isCategory,
  isDirty,
  parsedDetails,
  parseReward,
  REWARD_PICKS,
  todayLocal,
  type DetailField,
  type PostForm,
} from "@/lib/post-form";
import { cn } from "@/lib/utils";

type Step = 1 | 2 | 3 | 4;

const STEPS: { step: Step; label: string; heading: string }[] = [
  { step: 1, label: "Details", heading: "What did you lose?" },
  { step: 2, label: "Photo", heading: "Add a photo" },
  { step: 3, label: "Reward", heading: "Set a reward" },
  { step: 4, label: "Review", heading: "Check and post" },
];

const DETAIL_FIELDS: DetailField[] = [
  "title",
  "category",
  "location",
  "lostOn",
  "description",
];

const uploadResultSchema = z.object({ cid: z.string().min(1) });

interface Photo {
  file: File;
  url: string;
}

/**
 * Report lost item (docs/UI_SPEC.md → Report lost item): details → photo → reward → review.
 * The form stays in memory across steps and after a failed transaction. On submit the photo
 * and details are pinned, then `postItem(cid)` locks the reward; the new item's ID comes from
 * the receipt's `ItemPosted` event.
 */
export function PostWizard() {
  const router = useRouter();
  const flow = useTxFlow();
  const config = useContractConfig();
  const minReward = config.data?.minReward;

  const [step, setStep] = useState<Step>(1);
  const [form, setForm] = useState<PostForm>(EMPTY_POST_FORM);
  const [touched, setTouched] = useState<Set<DetailField>>(new Set());
  const [rewardTouched, setRewardTouched] = useState(false);
  const [photo, setPhoto] = useState<Photo | null>(null);
  const uploaded = useRef<{ key: string; cid: string } | null>(null);
  const posted = useRef(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const shownStep = useRef<Step>(1);

  // Leaving with unsaved input shows the browser's leave confirmation.
  const dirty = isDirty(form, photo !== null);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      if (posted.current) return;
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  // Move focus to the new step's heading so screen readers follow along.
  useEffect(() => {
    if (shownStep.current === step) return;
    shownStep.current = step;
    headingRef.current?.focus();
  }, [step]);

  useEffect(() => {
    return () => {
      if (photo) URL.revokeObjectURL(photo.url);
    };
  }, [photo]);

  const errors = detailErrors(form);
  const reward = parseReward(form.reward, minReward);

  function update<K extends keyof PostForm>(key: K, value: PostForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function touch(field: DetailField) {
    setTouched((current) => new Set(current).add(field));
  }

  function continueFrom(current: Step) {
    if (current === 1) {
      setTouched(new Set(DETAIL_FIELDS));
      if (Object.keys(errors).length > 0) {
        const first = DETAIL_FIELDS.find((field) => errors[field]);
        if (first) document.getElementById(`post-${first}`)?.focus();
        return;
      }
    }
    if (current === 3) {
      setRewardTouched(true);
      if ("error" in reward) {
        document.getElementById("post-reward")?.focus();
        return;
      }
    }
    setStep((current + 1) as Step);
  }

  async function submit() {
    const details = parsedDetails(form);
    if (!details) return setStep(1);
    if ("error" in reward) return setStep(3);
    const photoKey = photo
      ? `${photo.file.name}:${photo.file.size}:${photo.file.lastModified}`
      : "none";
    const key = `${JSON.stringify(details)}|${photoKey}`;

    const result = await flow.run({
      functionName: "postItem",
      args: [""],
      value: reward.wei,
      successMessage: "Item posted",
      errorContext: { minReward },
      prepare: async () => {
        // Reuse the pinned CID when retrying a failed transaction with the same input.
        if (uploaded.current?.key !== key) {
          const body = new FormData();
          for (const [name, value] of Object.entries(details))
            if (value !== undefined) body.append(name, value);
          if (photo) body.append("image", photo.file);
          const { cid } = uploadResultSchema.parse(
            await apiFetch("/api/upload", { method: "POST", body }),
          );
          uploaded.current = { key, cid };
        }
        return { args: [uploaded.current.cid] };
      },
    });

    if (result.state !== "confirmed" || !result.receipt) return;
    posted.current = true;
    const [event] = parseEventLogs({
      abi: lostAndFound.abi,
      eventName: "ItemPosted",
      logs: result.receipt.logs,
    });
    router.push(event ? `/items/${event.args.id.toString()}` : "/me");
  }

  const current = STEPS[step - 1];
  return (
    <div className="flex flex-col gap-32">
      <ol className="grid grid-cols-4 gap-9" aria-label="Steps">
        {STEPS.map(({ step: number, label }) => (
          <li
            key={number}
            aria-current={number === step ? "step" : undefined}
            className={cn(
              "flex flex-col gap-7 border-t-2 pt-9 font-mono text-caption uppercase",
              number === step
                ? "border-signal-orange text-white"
                : number < step
                  ? "border-steel text-snow"
                  : "border-charcoal text-cloud",
            )}
          >
            <span className="tabular">Step {number}</span>
            <span className="hidden sm:inline">{label}</span>
            <span className="sr-only sm:hidden">{label}</span>
          </li>
        ))}
      </ol>

      <section
        aria-labelledby="post-step-heading"
        className="flex flex-col gap-24 rounded-card border border-charcoal bg-carbon p-24 md:p-32"
      >
        <h2
          id="post-step-heading"
          ref={headingRef}
          tabIndex={-1}
          className="text-subheading outline-none md:text-heading-sm"
        >
          <span className="tabular">{step}</span> {current.heading}
        </h2>

        {step === 1 && (
          <DetailsStep
            form={form}
            errors={errors}
            touched={touched}
            onChange={update}
            onBlur={touch}
          />
        )}
        {step === 2 && <PhotoStep photo={photo} onChange={setPhoto} />}
        {step === 3 && (
          <RewardStep
            value={form.reward}
            minReward={minReward}
            error={rewardTouched && "error" in reward ? reward.error : null}
            onChange={(value) => update("reward", value)}
            onBlur={() => setRewardTouched(true)}
          />
        )}
        {step === 4 && (
          <ReviewStep
            form={form}
            photo={photo}
            rewardWei={"wei" in reward ? reward.wei : 0n}
            locked={flow.busy}
            onEdit={setStep}
          />
        )}

        {config.data?.paused && (
          <p
            role="status"
            className="flex items-start gap-9 text-body-sm text-snow"
          >
            <NodeDot tone="magenta" className="mt-5" />
            Posting and claiming are paused by the admins right now.
          </p>
        )}

        {step === 4 && flow.state !== "idle" ? (
          <TxPanel
            flow={flow}
            title="Posting your item"
            prepareLabel={photo ? "Uploading photo" : "Uploading details"}
            onDismiss={flow.reset}
          />
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-12">
            {step > 1 ? (
              <Button
                variant="quiet"
                onClick={() => setStep((step - 1) as Step)}
              >
                Back
              </Button>
            ) : (
              <span />
            )}
            {step < 4 ? (
              <Button onClick={() => continueFrom(step)}>Continue</Button>
            ) : (
              <WalletGate>
                <Button onClick={submit} disabled={flow.busy}>
                  Post and lock reward
                </Button>
              </WalletGate>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────── Fields

function Field({
  id,
  label,
  required = false,
  hint,
  error,
  counter,
  children,
}: {
  id: string;
  label: string;
  required?: boolean;
  hint?: string;
  error?: string | null;
  counter?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-7">
      <div className="flex items-baseline justify-between gap-12">
        <label htmlFor={id} className="text-body-sm font-semibold text-white">
          {label}
          {required && (
            <>
              <span aria-hidden="true" className="text-cloud">
                {" "}
                *
              </span>
              <span className="sr-only"> (required)</span>
            </>
          )}
        </label>
        {counter && (
          <span className="font-mono text-caption text-cloud tabular">
            {counter}
          </span>
        )}
      </div>
      {children}
      {hint && !error && (
        <p id={`${id}-hint`} className="text-caption text-cloud">
          {hint}
        </p>
      )}
      {error && (
        <p
          id={`${id}-error`}
          className="flex items-start gap-7 text-body-sm text-snow"
        >
          <NodeDot tone="magenta" className="mt-5" />
          {error}
        </p>
      )}
    </div>
  );
}

function describedBy(
  id: string,
  error: string | null | undefined,
  hint = false,
) {
  if (error) return `${id}-error`;
  return hint ? `${id}-hint` : undefined;
}

function DetailsStep({
  form,
  errors,
  touched,
  onChange,
  onBlur,
}: {
  form: PostForm;
  errors: Partial<Record<DetailField, string>>;
  touched: Set<DetailField>;
  onChange: <K extends keyof PostForm>(key: K, value: PostForm[K]) => void;
  onBlur: (field: DetailField) => void;
}) {
  const shown = (field: DetailField) =>
    touched.has(field) ? (errors[field] ?? null) : null;
  return (
    <div className="flex flex-col gap-20">
      <Field
        id="post-title"
        label="Title"
        required
        error={shown("title")}
        counter={`${form.title.length}/60`}
      >
        <Input
          id="post-title"
          value={form.title}
          maxLength={60}
          placeholder="Casio fx-991 calculator"
          autoComplete="off"
          aria-invalid={Boolean(shown("title"))}
          aria-describedby={describedBy("post-title", shown("title"))}
          onChange={(event) => onChange("title", event.target.value)}
          onBlur={() => onBlur("title")}
        />
      </Field>

      <Field
        id="post-category"
        label="Category"
        required
        error={shown("category")}
      >
        <Select
          value={form.category}
          onValueChange={(value) => {
            if (isCategory(value)) onChange("category", value);
            onBlur("category");
          }}
        >
          <SelectTrigger
            id="post-category"
            aria-invalid={Boolean(shown("category"))}
            aria-describedby={describedBy("post-category", shown("category"))}
            onBlur={() => onBlur("category")}
          >
            <SelectValue placeholder="Pick a category" />
          </SelectTrigger>
          <SelectContent>
            {CATEGORIES.map((category) => (
              <SelectItem key={category} value={category}>
                <NodeDot tone={CATEGORY_TONE[category]} />
                {category}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <Field
        id="post-location"
        label="Where"
        required
        error={shown("location")}
        counter={`${form.location.length}/80`}
      >
        <Input
          id="post-location"
          value={form.location}
          maxLength={80}
          placeholder="Library, 2nd floor"
          autoComplete="off"
          aria-invalid={Boolean(shown("location"))}
          aria-describedby={describedBy("post-location", shown("location"))}
          onChange={(event) => onChange("location", event.target.value)}
          onBlur={() => onBlur("location")}
        />
      </Field>

      <Field id="post-lostOn" label="When" required error={shown("lostOn")}>
        <Input
          id="post-lostOn"
          type="date"
          value={form.lostOn}
          max={todayLocal()}
          className="[color-scheme:dark] sm:max-w-240"
          aria-invalid={Boolean(shown("lostOn"))}
          aria-describedby={describedBy("post-lostOn", shown("lostOn"))}
          onChange={(event) => onChange("lostOn", event.target.value)}
          onBlur={() => onBlur("lostOn")}
        />
      </Field>

      <Field
        id="post-description"
        label="Description"
        error={shown("description")}
        counter={`${form.description.length}/280`}
      >
        <Textarea
          id="post-description"
          value={form.description}
          maxLength={280}
          placeholder="Black, sticker on the back"
          aria-invalid={Boolean(shown("description"))}
          aria-describedby={describedBy(
            "post-description",
            shown("description"),
          )}
          onChange={(event) => onChange("description", event.target.value)}
          onBlur={() => onBlur("description")}
        />
      </Field>

      <p className="flex items-start gap-9 rounded-card border border-charcoal bg-obsidian px-16 py-12 text-body-sm text-snow">
        <TriangleAlertIcon
          aria-hidden="true"
          className="mt-2 size-16 shrink-0 text-cloud"
        />
        Don&apos;t include your name, phone or roll number. Everything here is
        public and permanent.
      </p>
    </div>
  );
}

function PhotoStep({
  photo,
  onChange,
}: {
  photo: Photo | null;
  onChange: (photo: Photo | null) => void;
}) {
  const inputId = useId();
  const cameraId = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  async function choose(file: File | undefined) {
    if (!file) return;
    setError(null);
    setBusy(true);
    try {
      const compressed = await compressPhoto(file);
      onChange({ file: compressed, url: URL.createObjectURL(compressed) });
    } catch (cause) {
      setError(
        cause instanceof PhotoError
          ? cause.message
          : "We couldn't read that photo. Try another.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-16">
      <p className="text-body-sm text-cloud">
        Optional, but a photo helps finders recognise it. It&apos;s resized and
        stripped of location data before upload.
      </p>
      {photo ? (
        <div className="flex flex-col gap-12">
          {/* eslint-disable-next-line @next/next/no-img-element -- local blob preview */}
          <img
            src={photo.url}
            alt="Preview of your photo"
            className="aspect-[4/3] w-full max-w-480 rounded-chip bg-void object-contain"
          />
          <p className="font-mono text-caption text-cloud uppercase tabular">
            {(photo.file.size / 1024).toFixed(0)} KB · ready to upload
          </p>
          <Button
            variant="ghost"
            size="sm"
            className="w-fit"
            onClick={() => onChange(null)}
          >
            Remove photo
          </Button>
        </div>
      ) : (
        <label
          htmlFor={inputId}
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            void choose(event.dataTransfer.files[0]);
          }}
          className={cn(
            "flex min-h-200 cursor-pointer flex-col items-center justify-center gap-12 rounded-card border border-dashed bg-obsidian px-24 py-32 text-center transition-colors focus-within:border-signal-orange",
            dragging
              ? "border-signal-orange"
              : "border-steel hover:border-snow",
          )}
        >
          <ImageIcon aria-hidden="true" className="size-28 text-cloud" />
          <span className="font-clash text-body font-medium tracking-clash text-white uppercase">
            {busy ? "Compressing…" : "Choose a photo"}
          </span>
          <span className="text-body-sm text-cloud">
            Or drag it here. JPEG, PNG, WebP or HEIC.
          </span>
          <input
            id={inputId}
            type="file"
            accept="image/*"
            className="sr-only"
            disabled={busy}
            onChange={(event) => {
              void choose(event.target.files?.[0]);
              event.target.value = "";
            }}
          />
        </label>
      )}
      {!photo && (
        <div className="md:hidden">
          <label
            htmlFor={cameraId}
            className="inline-flex min-h-44 cursor-pointer items-center gap-9 rounded-pill px-24 font-clash text-body-sm font-medium tracking-clash text-white uppercase shadow-subtle focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-signal-orange"
          >
            <CameraIcon aria-hidden="true" className="size-16" />
            Take a photo
            <input
              id={cameraId}
              type="file"
              accept="image/*"
              capture="environment"
              className="sr-only"
              disabled={busy}
              onChange={(event) => {
                void choose(event.target.files?.[0]);
                event.target.value = "";
              }}
            />
          </label>
        </div>
      )}
      {error && (
        <p
          role="alert"
          className="flex items-start gap-9 text-body-sm text-snow"
        >
          <NodeDot tone="magenta" className="mt-5" />
          {error}
        </p>
      )}
    </div>
  );
}

function RewardStep({
  value,
  minReward,
  error,
  onChange,
  onBlur,
}: {
  value: string;
  minReward: bigint | undefined;
  error: string | null;
  onChange: (value: string) => void;
  onBlur: () => void;
}) {
  const wallet = useWallet();
  const balance = useBalance({
    address: wallet.address ?? undefined,
    chainId: appChain.id,
    query: { enabled: Boolean(wallet.address) },
  });
  return (
    <div className="flex flex-col gap-20">
      <Field
        id="post-reward"
        label="Reward"
        required
        error={error}
        hint={
          minReward !== undefined
            ? `At least ${formatEthValue(minReward)} ETH.`
            : undefined
        }
      >
        <div className="relative sm:max-w-320">
          <Input
            id="post-reward"
            inputMode="decimal"
            autoComplete="off"
            value={value}
            placeholder="0.005"
            className="pr-64 font-mono tabular"
            aria-invalid={Boolean(error)}
            aria-describedby={describedBy(
              "post-reward",
              error,
              minReward !== undefined,
            )}
            onChange={(event) => onChange(event.target.value.replace(",", "."))}
            onBlur={onBlur}
          />
          <span
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 right-24 -translate-y-1/2 font-mono text-body-sm text-cloud"
          >
            ETH
          </span>
        </div>
      </Field>
      <div
        className="flex flex-wrap gap-9"
        role="group"
        aria-label="Quick picks"
      >
        {REWARD_PICKS.map((pick) => (
          <Button
            key={pick}
            variant="ghost"
            size="sm"
            aria-pressed={value === pick}
            className={cn(
              "font-mono normal-case",
              value === pick && "bg-obsidian",
            )}
            onClick={() => onChange(pick)}
          >
            {pick} ETH
          </Button>
        ))}
      </div>
      <p className="font-mono text-body-sm text-snow" aria-live="polite">
        {wallet.address
          ? balance.data
            ? `Wallet balance ${formatEth(balance.data.value)}`
            : "Checking your balance…"
          : "Connect MetaMask to see your balance."}
      </p>
      <p className="text-body-sm text-cloud">
        Locked until you confirm the return or cancel the listing. The reward is
        test ETH with no real value.
      </p>
    </div>
  );
}

function ReviewStep({
  form,
  photo,
  rewardWei,
  locked,
  onEdit,
}: {
  form: PostForm;
  photo: Photo | null;
  rewardWei: bigint;
  /** A transaction is running; editing would change what's being posted. */
  locked: boolean;
  onEdit: (step: Step) => void;
}) {
  const metadata: ItemMetadata | undefined =
    form.category && form.lostOn
      ? {
          title: form.title.trim(),
          category: form.category,
          location: form.location.trim(),
          lostOn: form.lostOn,
          description: form.description.trim() || undefined,
        }
      : undefined;
  const [postedAt] = useState(() => BigInt(Math.floor(Date.now() / 1000)));
  const preview: Item = {
    id: 0n,
    owner: zeroAddress,
    status: "Open",
    createdAt: postedAt,
    finder: null,
    claimedAt: null,
    claimWindow: 0n,
    reward: rewardWei,
    stake: 0n,
    metadataCID: "",
  };
  const rows: { label: string; value: ReactNode; step: Step }[] = [
    { label: "Title", value: form.title, step: 1 },
    { label: "Category", value: form.category, step: 1 },
    { label: "Where", value: form.location, step: 1 },
    {
      label: "When",
      value: form.lostOn ? formatDay(form.lostOn) : "",
      step: 1,
    },
    {
      label: "Description",
      value: form.description.trim() || (
        <span className="text-cloud">None</span>
      ),
      step: 1,
    },
    {
      label: "Photo",
      value: photo ? "Added" : <span className="text-cloud">None</span>,
      step: 2,
    },
    {
      label: "Reward",
      value: <span className="font-mono tabular">{formatEth(rewardWei)}</span>,
      step: 3,
    },
  ];
  return (
    <div className="grid gap-24 md:grid-cols-2">
      <div aria-label="Preview" role="group" className="max-w-400">
        <ItemCard
          item={preview}
          metadata={metadata}
          photoSrc={photo?.url}
          preview
        />
      </div>
      <div className="flex flex-col gap-16">
        <dl className="flex flex-col divide-y divide-charcoal">
          {rows.map((row) => (
            <div
              key={row.label}
              className="flex items-baseline justify-between gap-12 py-9"
            >
              <dt className="shrink-0 font-mono text-caption text-cloud uppercase">
                {row.label}
              </dt>
              <dd className="min-w-0 text-right text-body-sm break-words text-snow">
                {row.value}
              </dd>
            </div>
          ))}
        </dl>
        <div className="flex flex-wrap gap-9">
          <Button
            variant="quiet"
            size="sm"
            disabled={locked}
            onClick={() => onEdit(1)}
          >
            Edit details
          </Button>
          <Button
            variant="quiet"
            size="sm"
            disabled={locked}
            onClick={() => onEdit(2)}
          >
            Edit photo
          </Button>
          <Button
            variant="quiet"
            size="sm"
            disabled={locked}
            onClick={() => onEdit(3)}
          >
            Edit reward
          </Button>
        </div>
        <p className="text-body-sm text-cloud">
          Posting locks {formatEth(rewardWei)} in the contract until you confirm
          the return or cancel the listing. MetaMask will ask you to confirm.
        </p>
      </div>
    </div>
  );
}
