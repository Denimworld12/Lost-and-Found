import { CATEGORIES } from "@clf/shared";
import { z } from "zod";

// Our CSP forbids eval; without this zod probes `new Function` and the browser logs a CSP violation.
z.config({ jitless: true });

/** Pinata's public gateway; used until a dedicated gateway is set in `NEXT_PUBLIC_PINATA_GATEWAY`. */
export const DEFAULT_PINATA_GATEWAY = "gateway.pinata.cloud";

/** Gateway host, e.g. `your-gateway.mypinata.cloud`. A full URL in the variable is reduced to its host. */
export function pinataGateway(): string {
  const value = process.env.NEXT_PUBLIC_PINATA_GATEWAY?.trim();
  if (!value) return DEFAULT_PINATA_GATEWAY;
  return value.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
}

// CIDv0 (base58btc "Qm…") or CIDv1 (base32 "b…"). Anything else is never sent to the gateway.
const CID_PATTERN = /^(Qm[1-9A-HJ-NP-Za-km-z]{44}|b[a-z2-7]{58,})$/;

export function isCid(value: string): boolean {
  return CID_PATTERN.test(value);
}

/**
 * Read key for a dedicated gateway with access controls (`NEXT_PUBLIC_PINATA_GATEWAY_KEY`).
 * Without it such a gateway answers 401 ERR_ID:00024. Never sent to the shared public gateway.
 */
export function pinataGatewayKey(): string | null {
  if (pinataGateway() === DEFAULT_PINATA_GATEWAY) return null;
  return process.env.NEXT_PUBLIC_PINATA_GATEWAY_KEY?.trim() || null;
}

/** Gateway URL for a CID, or `null` if the value isn't a CID. */
export function ipfsUrl(cid: string): string | null {
  if (!isCid(cid)) return null;
  const url = `https://${pinataGateway()}/ipfs/${cid}`;
  const key = pinataGatewayKey();
  return key ? `${url}?pinataGatewayToken=${encodeURIComponent(key)}` : url;
}

/** Item metadata JSON pinned to IPFS by the upload API. Public and permanent: no personal data. */
export const itemMetadataSchema = z.object({
  title: z.string().trim().min(1).max(60),
  category: z.enum(CATEGORIES),
  location: z.string().trim().min(1).max(80),
  /** Day the item was lost, `YYYY-MM-DD`. */
  lostOn: z.iso.date(),
  description: z.string().trim().max(280).optional(),
  /** CID of the photo, if one was uploaded. */
  image: z.string().regex(CID_PATTERN).optional(),
});

export type ItemMetadata = z.infer<typeof itemMetadataSchema>;

/** Latest `lostOn` accepted: tomorrow in UTC, so a student ahead of UTC can pick their today. */
function latestLostOn(now = new Date()): string {
  return new Date(now.getTime() + 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
}

/**
 * What the student types in the post form (metadata minus the photo CID). Shared by the form
 * and `POST /api/upload`.
 */
export const itemDetailsSchema = itemMetadataSchema
  .omit({ image: true })
  .refine((details) => details.lostOn <= latestLostOn(), {
    path: ["lostOn"],
    message: "The date can't be in the future.",
  });

export type ItemDetails = z.infer<typeof itemDetailsSchema>;

export class MetadataUnavailableError extends Error {
  constructor(cid: string, reason: string) {
    super(`Metadata ${cid} unavailable: ${reason}`);
    this.name = "MetadataUnavailableError";
  }
}

/** How long to wait for the gateway; unpinned CIDs otherwise hang while it searches the network. */
export const METADATA_TIMEOUT_MS = 8_000;

/** Fetches and validates an item's metadata. Throws `MetadataUnavailableError` on any failure. */
export async function fetchMetadata(
  cid: string,
  signal?: AbortSignal,
): Promise<ItemMetadata> {
  const url = ipfsUrl(cid);
  if (!url) throw new MetadataUnavailableError(cid, "not a CID");

  const timeout = AbortSignal.timeout(METADATA_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(url, {
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      headers: { accept: "application/json" },
    });
  } catch (error) {
    throw new MetadataUnavailableError(
      cid,
      error instanceof Error ? error.name : "network error",
    );
  }
  if (!response.ok)
    throw new MetadataUnavailableError(cid, `HTTP ${response.status}`);

  let json: unknown;
  try {
    json = await response.json();
  } catch {
    throw new MetadataUnavailableError(cid, "not JSON");
  }
  const parsed = itemMetadataSchema.safeParse(json);
  if (!parsed.success) throw new MetadataUnavailableError(cid, "invalid shape");
  return parsed.data;
}

/**
 * React Query options for an item's metadata. CIDs are content-addressed, so a loaded
 * result never goes stale.
 */
export function metadataQueryOptions(cid: string) {
  return {
    queryKey: ["metadata", cid] as const,
    queryFn: ({ signal }: { signal: AbortSignal }) =>
      fetchMetadata(cid, signal),
    staleTime: Infinity,
    gcTime: 60 * 60 * 1000,
    // One attempt: an unpinned CID would otherwise keep a skeleton up for two full timeouts.
    // A failed CID is tried again when the item is next shown.
    retry: false,
  };
}
