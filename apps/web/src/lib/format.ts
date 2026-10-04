import { format } from "date-fns";
import { formatEther } from "viem";

const WEI_PER_UNIT = 10n ** 14n; // 0.0001 ETH, the smallest amount shown

/**
 * Wei as an ETH number string with at most 4 decimals, rounded down so it never overstates
 * a balance: `10000000000000000n` → `"0.01"`. Non-zero amounts below 0.0001 show `"<0.0001"`.
 */
export function formatEthValue(wei: bigint): string {
  if (wei === 0n) return "0";
  const negative = wei < 0n;
  const abs = negative ? -wei : wei;
  if (abs < WEI_PER_UNIT) return negative ? ">-0.0001" : "<0.0001";
  const truncated = (abs / WEI_PER_UNIT) * WEI_PER_UNIT;
  const [whole, fraction = ""] = formatEther(truncated).split(".");
  const trimmed = fraction.slice(0, 4).replace(/0+$/, "");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${negative ? "-" : ""}${grouped}${trimmed ? `.${trimmed}` : ""}`;
}

/** `formatEthValue` plus the unit: `"0.01 ETH"`. */
export function formatEth(wei: bigint): string {
  return `${formatEthValue(wei)} ETH`;
}

/** `0x4b…91af`. Returns the input unchanged if it's too short to shorten. */
export function shortAddress(address: string): string {
  if (address.length < 11) return address;
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}

/** `0x8b14…ec61` for transaction hashes. */
export function shortHash(hash: string): string {
  if (hash.length < 13) return hash;
  return `${hash.slice(0, 6)}…${hash.slice(-4)}`;
}

/** Contract timestamps are seconds; JS dates are milliseconds. For display only. */
export function toDate(seconds: bigint): Date {
  return new Date(Number(seconds) * 1000);
}

/** Compact time since a timestamp: `"just now"`, `"5m ago"`, `"3h ago"`, `"2d ago"`, then a date. */
export function relativeTime(
  seconds: bigint,
  nowMs: number = Date.now(),
): string {
  const diff = Math.max(0, Math.floor(nowMs / 1000) - Number(seconds));
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86_400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 30 * 86_400) return `${Math.floor(diff / 86_400)}d ago`;
  return formatDate(seconds);
}

/** `"2 Oct 2026"`. */
export function formatDate(seconds: bigint): string {
  return format(toDate(seconds), "d MMM yyyy");
}

/** `"3 Oct, 10:42"`. */
export function formatDateTime(seconds: bigint): string {
  return format(toDate(seconds), "d MMM, HH:mm");
}

/** A `YYYY-MM-DD` day as `"2 Oct 2026"`, without shifting it across time zones. */
export function formatDay(day: string): string {
  const [year, month, date] = day.split("-").map(Number);
  return format(new Date(year, month - 1, date), "d MMM yyyy");
}

/**
 * Time left until `endSeconds`, measured against `nowSeconds` (use chain time, not the device
 * clock): `"2d 04h left"`, `"3h 05m left"`, `"12m left"`. `null` once the time has passed.
 */
export function countdown(
  endSeconds: bigint,
  nowSeconds: bigint,
): string | null {
  const left = Number(endSeconds - nowSeconds);
  if (left <= 0) return null;
  const days = Math.floor(left / 86_400);
  const hours = Math.floor((left % 86_400) / 3600);
  const minutes = Math.floor((left % 3600) / 60);
  const pad = (value: number) => value.toString().padStart(2, "0");
  if (days > 0) return `${days}d ${pad(hours)}h left`;
  if (hours > 0) return `${hours}h ${pad(minutes)}m left`;
  return `${Math.max(1, minutes)}m left`;
}

/** A length of time in seconds as words: `"3 days"`, `"5 minutes"`, `"1 day 12 hours"`. */
export function formatDuration(seconds: bigint): string {
  let left = Number(seconds);
  const parts: string[] = [];
  for (const [unit, size] of [
    ["day", 86_400],
    ["hour", 3600],
    ["minute", 60],
  ] as const) {
    const count = Math.floor(left / size);
    if (count > 0) parts.push(`${count} ${unit}${count === 1 ? "" : "s"}`);
    left %= size;
  }
  return parts.length > 0
    ? parts.slice(0, 2).join(" ")
    : `${Number(seconds)} seconds`;
}
