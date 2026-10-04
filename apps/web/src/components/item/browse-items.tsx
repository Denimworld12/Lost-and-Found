"use client";

import { CATEGORIES, type Category, type ItemStatus } from "@clf/shared";
import { SearchIcon } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useItems } from "@/hooks/useItems";
import { useMetadataMap } from "@/hooks/useMetadata";
import { CHAIN_FALLBACK_LIMIT, type ItemSort } from "@/lib/graph";
import { EmptyState } from "./empty-state";
import { ItemCard, ItemCardSkeleton } from "./item-card";
import { NodeDot } from "./node-dot";
import { CATEGORY_TONE, STATUS_FILTERS, STATUS_META } from "./status";

const ALL = "all";

export interface BrowseFilters {
  status: ItemStatus | undefined;
  category: Category | undefined;
  sort: ItemSort;
  query: string;
}

/** Reads filters from the URL (`?status=Open&category=Electronics&sort=newest&q=…`). Status defaults to Open. */
export function parseBrowseFilters(params: URLSearchParams): BrowseFilters {
  const statusParam = params.get("status");
  const status =
    statusParam === ALL
      ? undefined
      : (STATUS_FILTERS.find(
          (value) => value.toLowerCase() === statusParam?.toLowerCase(),
        ) ?? "Open");
  const categoryParam = params.get("category");
  const category = CATEGORIES.find((value) => value === categoryParam);
  const sort: ItemSort = params.get("sort") === "reward" ? "reward" : "newest";
  return { status, category, sort, query: params.get("q")?.trim() ?? "" };
}

const gridClass = "grid grid-cols-1 gap-24 sm:grid-cols-2 lg:grid-cols-3";

export function BrowseItems() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const filters = parseBrowseFilters(searchParams);
  const searchId = useId();

  const { data, isPending, isError, refetch } = useItems({
    status: filters.status,
    sort: filters.sort,
  });
  const items = data?.items ?? [];
  const { data: metadata, pending: metadataPending } = useMetadataMap(
    items.map((item) => item.metadataCID),
  );

  const [query, setQuery] = useState(filters.query);

  function setParam(key: string, value: string | null) {
    const next = new URLSearchParams(searchParams.toString());
    if (value === null || value === "") next.delete(key);
    else next.set(key, value);
    const search = next.toString();
    router.replace(search ? `${pathname}?${search}` : pathname, {
      scroll: false,
    });
  }

  // Keep `q` in the URL so searches are shareable, without a navigation per keystroke.
  useEffect(() => {
    if (query.trim() === filters.query) return;
    const timer = setTimeout(() => setParam("q", query.trim() || null), 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const needle = filters.query.toLowerCase();
  const needsMetadata = Boolean(filters.category || needle);
  const visible = items.filter((item) => {
    if (!needsMetadata) return true;
    const meta = metadata.get(item.metadataCID);
    if (!meta) return false;
    if (filters.category && meta.category !== filters.category) return false;
    if (needle && !meta.title.toLowerCase().includes(needle)) return false;
    return true;
  });
  const filtering = needsMetadata && metadataPending.size > 0;

  const statusLabel = filters.status
    ? STATUS_META[filters.status].label.toLowerCase()
    : "";
  const countText = isPending
    ? "Loading items…"
    : `${visible.length} ${visible.length === 1 ? "item" : "items"}${filtering ? " so far, loading details…" : ""}`;

  return (
    <div className="flex flex-col gap-24">
      <form
        role="search"
        aria-label="Filter items"
        onSubmit={(event) => {
          event.preventDefault();
          setParam("q", query.trim() || null);
        }}
        className="grid grid-cols-1 gap-12 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))]"
      >
        <div className="relative sm:col-span-2 lg:col-span-1">
          <label htmlFor={searchId} className="sr-only">
            Search by title
          </label>
          <SearchIcon
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-20 size-16 -translate-y-1/2 text-cloud"
          />
          <Input
            id={searchId}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by title"
            className="pl-44"
            enterKeyHint="search"
          />
        </div>
        <Select
          value={filters.status ?? ALL}
          onValueChange={(value) =>
            setParam("status", value === "Open" ? null : value)
          }
        >
          <SelectTrigger aria-label="Status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_FILTERS.map((status) => (
              <SelectItem key={status} value={status}>
                <NodeDot tone={STATUS_META[status].tone} />
                {STATUS_META[status].label}
              </SelectItem>
            ))}
            <SelectItem value={ALL}>
              <DotSpacer />
              All statuses
            </SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={filters.category ?? ALL}
          onValueChange={(value) =>
            setParam("category", value === ALL ? null : value)
          }
        >
          <SelectTrigger aria-label="Category">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>
              <DotSpacer />
              All categories
            </SelectItem>
            {CATEGORIES.map((category) => (
              <SelectItem key={category} value={category}>
                <NodeDot tone={CATEGORY_TONE[category]} />
                {category}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={filters.sort}
          onValueChange={(value) =>
            setParam("sort", value === "newest" ? null : value)
          }
        >
          <SelectTrigger aria-label="Sort">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="newest">Newest first</SelectItem>
            <SelectItem value="reward">Highest reward</SelectItem>
          </SelectContent>
        </Select>
      </form>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <p
          role="status"
          className="font-mono text-caption text-cloud uppercase tabular"
        >
          {countText}
        </p>
        {data?.source === "chain" && data.totalPosted > 0n && (
          <p className="inline-flex items-center gap-7 text-caption text-cloud">
            <NodeDot tone="cyan" />
            Showing the latest {CHAIN_FALLBACK_LIMIT} items directly from the
            blockchain.
          </p>
        )}
      </div>

      {/* Min height keeps the footer from jumping into view when skeletons give way to a short empty state. */}
      <div className="min-h-560">
        {isPending ? (
          <ul aria-label="Loading items" className={gridClass}>
            {[0, 1, 2, 3, 4, 5].map((key) => (
              <li key={key}>
                <ItemCardSkeleton className="h-full" />
              </li>
            ))}
          </ul>
        ) : isError ? (
          <EmptyState
            title="We couldn't load items from the blockchain."
            action={
              <Button variant="ghost" onClick={() => refetch()}>
                Try again
              </Button>
            }
          >
            The network may be busy. Check your connection, then try again.
          </EmptyState>
        ) : visible.length === 0 && !filtering ? (
          <BrowseEmpty
            filters={filters}
            statusLabel={statusLabel}
            hasAnyItems={(data?.totalPosted ?? 0n) > 0n}
          />
        ) : (
          <ul className={gridClass}>
            {visible.map((item, index) => (
              <li key={item.id.toString()}>
                <ItemCard
                  item={item}
                  metadata={metadata.get(item.metadataCID)}
                  metadataPending={metadataPending.has(item.metadataCID)}
                  priority={index < 3}
                  headingLevel={2}
                  className="h-full"
                />
              </li>
            ))}
            {filtering &&
              visible.length === 0 &&
              [0, 1, 2].map((key) => (
                <li key={`pending-${key}`}>
                  <ItemCardSkeleton className="h-full" />
                </li>
              ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function BrowseEmpty({
  filters,
  statusLabel,
  hasAnyItems,
}: {
  filters: BrowseFilters;
  statusLabel: string;
  hasAnyItems: boolean;
}) {
  const narrowed = filters.category || filters.query;
  if (!narrowed && filters.status === "Open") {
    return (
      <EmptyState
        title="No open items right now. Lost something?"
        action={
          <Button asChild>
            <Link href="/post">Report lost item</Link>
          </Button>
        }
      >
        {hasAnyItems ? (
          <>
            Returned and cancelled items stay public.{" "}
            <Link
              href="/items?status=all"
              className="text-snow underline underline-offset-4 hover:text-white"
            >
              Show all statuses
            </Link>
            .
          </>
        ) : (
          "Nothing has been posted yet. Post the first item and lock a reward for whoever finds it."
        )}
      </EmptyState>
    );
  }
  return (
    <EmptyState
      title={`No ${statusLabel ? `${statusLabel} ` : ""}items match these filters.`}
      action={
        <Button asChild variant="ghost">
          <Link href="/items">Clear filters</Link>
        </Button>
      }
    >
      Try another category or a shorter search. Items whose details haven&apos;t
      loaded can&apos;t match a search.
    </EmptyState>
  );
}

/** Keeps "All …" options aligned with the options that start with a node dot. */
function DotSpacer() {
  return <span aria-hidden="true" className="inline-block size-8 shrink-0" />;
}
