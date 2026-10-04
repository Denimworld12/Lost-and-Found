"use client";

import type { Item } from "@clf/shared";
import Link from "next/link";
import { CATEGORY_TONE } from "@/components/item/status";
import { NodeDot } from "@/components/item/node-dot";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatEthValue } from "@/lib/format";
import type { ItemMetadata } from "@/lib/ipfs";
import { cn } from "@/lib/utils";

/** Lattice spacing in SVG units: vertices sit every STEP_X across and STEP_Y down, on alternating columns. */
const STEP_X = 40;
const STEP_Y = 32;

interface Layout {
  width: number;
  height: number;
  columns: number;
  rows: number;
  maxDots: number;
}

const LAYOUTS = {
  desktop: { width: 560, height: 448, columns: 14, rows: 14, maxDots: 24 },
  mobile: { width: 320, height: 240, columns: 8, rows: 7, maxDots: 12 },
} as const satisfies Record<string, Layout>;

interface Point {
  x: number;
  y: number;
}

/** Vertices where dots may sit: every lattice intersection except the outer ring. */
function dotSlots({ columns, rows }: Layout): Point[] {
  const slots: Point[] = [];
  for (let j = 1; j < rows; j++) {
    for (let i = 1; i < columns; i++) {
      if ((i + j) % 2 === 0) slots.push({ x: i * STEP_X, y: j * STEP_Y });
    }
  }
  return slots;
}

/** Diamond cells: centred on odd-parity points, corners on the vertices. */
function diamondPath({ columns, rows }: Layout): string {
  const parts: string[] = [];
  for (let j = 0; j <= rows; j++) {
    for (let i = 0; i <= columns; i++) {
      if ((i + j) % 2 === 1) {
        const cx = i * STEP_X;
        const cy = j * STEP_Y;
        parts.push(
          `M${cx} ${cy - STEP_Y}L${cx + STEP_X} ${cy}L${cx} ${cy + STEP_Y}L${cx - STEP_X} ${cy}Z`,
        );
      }
    }
  }
  return parts.join("");
}

/** Deterministic 32-bit hash of an item ID, so a dot keeps its place across renders and visits. */
function hashId(id: bigint): number {
  let h = Number(id % 4294967296n) ^ 0x9e3779b9;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

/** Places each item on a free vertex picked by its ID; collisions move to the next free slot. */
export function placeItems(items: Item[], slots: Point[]): Map<string, Point> {
  const taken = new Set<number>();
  const placed = new Map<string, Point>();
  for (const item of items) {
    if (taken.size >= slots.length) break;
    let index = hashId(item.id) % slots.length;
    while (taken.has(index)) index = (index + 1) % slots.length;
    taken.add(index);
    placed.set(item.id.toString(), slots[index]);
  }
  return placed;
}

function LatticeView({
  layout,
  items,
  metadata,
  className,
}: {
  layout: Layout;
  items: Item[];
  metadata: Map<string, ItemMetadata>;
  className?: string;
}) {
  const shown = items.slice(0, layout.maxDots);
  const slots = dotSlots(layout);
  const placed = placeItems(shown, slots);
  const newest = shown[0];
  const newestPoint = newest ? placed.get(newest.id.toString()) : undefined;
  // The glow fills the diamond just below the newest dot, or a central diamond when nothing is open.
  const glow = newestPoint
    ? { x: newestPoint.x, y: newestPoint.y + STEP_Y }
    : {
        x: Math.round(layout.columns / 2) * STEP_X + STEP_X,
        y: Math.floor(layout.rows / 2) * STEP_Y,
      };
  const glowPath = `M${glow.x} ${glow.y - STEP_Y}L${glow.x + STEP_X} ${glow.y}L${glow.x} ${glow.y + STEP_Y}L${glow.x - STEP_X} ${glow.y}Z`;
  const gradientId = `lattice-glow-${layout.rows}`;
  const blurId = `lattice-blur-${layout.rows}`;

  return (
    <div
      className={cn("relative w-full", className)}
      style={{ aspectRatio: `${layout.width} / ${layout.height}` }}
    >
      <svg
        viewBox={`0 0 ${layout.width} ${layout.height}`}
        aria-hidden="true"
        className="absolute inset-0 size-full"
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="var(--color-node-magenta)" />
            <stop offset="1" stopColor="var(--color-signal-orange)" />
          </linearGradient>
          <filter id={blurId} x="-100%" y="-100%" width="300%" height="300%">
            <feGaussianBlur stdDeviation="18" />
          </filter>
        </defs>
        <path
          d={glowPath}
          fill={`url(#${gradientId})`}
          opacity="0.55"
          filter={`url(#${blurId})`}
        />
        <path d={glowPath} fill={`url(#${gradientId})`} opacity="0.35" />
        <path
          d={diamondPath(layout)}
          stroke="var(--color-charcoal)"
          strokeWidth="1.25"
          fill="none"
        />
      </svg>
      <ul aria-label="Open items" className="absolute inset-0">
        {shown.map((item, index) => {
          const point = placed.get(item.id.toString());
          if (!point) return null;
          const meta = metadata.get(item.metadataCID);
          const title = meta?.title ?? `Item #${item.id.toString()}`;
          const reward = `${formatEthValue(item.reward)} ETH`;
          return (
            <li
              key={item.id.toString()}
              className="absolute -translate-x-1/2 -translate-y-1/2"
              style={{
                left: `${(point.x / layout.width) * 100}%`,
                top: `${(point.y / layout.height) * 100}%`,
              }}
            >
              <Tooltip>
                <TooltipTrigger asChild>
                  <Link
                    href={`/items/${item.id.toString()}`}
                    aria-label={`${title}, reward ${reward}`}
                    className="flex size-28 items-center justify-center rounded-badge pointer-coarse:size-44"
                  >
                    <NodeDot
                      tone={meta ? CATEGORY_TONE[meta.category] : "steel"}
                      size={10}
                      className={cn(
                        index === 0 && "motion-safe:animate-node-pulse",
                      )}
                    />
                  </Link>
                </TooltipTrigger>
                <TooltipContent side="top" className="flex flex-col gap-4">
                  <span className="text-body-sm text-white">{title}</span>
                  <span className="font-mono text-caption">
                    <span className="text-signal-orange">
                      {formatEthValue(item.reward)}
                    </span>{" "}
                    <span className="text-cloud">ETH reward</span>
                  </span>
                </TooltipContent>
              </Tooltip>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * The hero lattice: diamond outlines in Charcoal with one dot per Open item (24 on desktop,
 * 12 on phones), coloured by category. Dots are links; hover or focus shows title and reward.
 * The newest item gets the app's only gradient glow and a slow pulse (none with reduced motion).
 */
export function Lattice({
  items,
  metadata,
}: {
  items: Item[];
  metadata: Map<string, ItemMetadata>;
}) {
  return (
    <>
      <LatticeView
        layout={LAYOUTS.desktop}
        items={items}
        metadata={metadata}
        className="hidden lg:block"
      />
      <LatticeView
        layout={LAYOUTS.mobile}
        items={items}
        metadata={metadata}
        className="mx-auto max-w-328 lg:hidden"
      />
    </>
  );
}
