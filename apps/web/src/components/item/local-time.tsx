"use client";

import { useIsClient } from "@/hooks/useIsClient";
import {
  formatDate,
  formatDateTime,
  formatDay,
  relativeTime,
  toDate,
} from "@/lib/format";

type Format = "date" | "datetime" | "relative";

const FORMATTERS: Record<Format, (seconds: bigint) => string> = {
  date: formatDate,
  datetime: formatDateTime,
  relative: (seconds) => relativeTime(seconds),
};

/**
 * A contract timestamp in the visitor's time zone. The server doesn't know that zone, so the
 * text appears after hydration; `dateTime` carries the exact instant for assistive tech.
 */
export function LocalTime({
  seconds,
  format = "date",
}: {
  seconds: bigint;
  format?: Format;
}) {
  const isClient = useIsClient();
  const iso = toDate(seconds).toISOString();
  return (
    <time
      dateTime={iso}
      title={isClient ? toDate(seconds).toLocaleString() : undefined}
    >
      {isClient ? FORMATTERS[format](seconds) : " "}
    </time>
  );
}

/** Whole days between a `YYYY-MM-DD` day and today, in the visitor's zone: "today", "yesterday", "3d ago". */
export function daysAgo(day: string, now = new Date()): string {
  const [year, month, date] = day.split("-").map(Number);
  const then = new Date(year, month - 1, date);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const days = Math.round((today.getTime() - then.getTime()) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;
  return `on ${formatDay(day)}`;
}

/** "Lost 2d ago" from the metadata day, else "Posted 2d ago" from the chain timestamp. */
export function LostAgo({
  lostOn,
  createdAt,
}: {
  lostOn?: string;
  createdAt: bigint;
}) {
  const isClient = useIsClient();
  if (!isClient) return <span>&nbsp;</span>;
  if (lostOn) return <span>Lost {daysAgo(lostOn)}</span>;
  return <span>Posted {relativeTime(createdAt)}</span>;
}
