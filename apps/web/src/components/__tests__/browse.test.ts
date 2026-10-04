import type { Item } from "@clf/shared";
import { describe, expect, it } from "vitest";
import { placeItems } from "../home/Lattice";
import { parseBrowseFilters } from "../item/browse-items";
import { daysAgo } from "../item/local-time";

describe("parseBrowseFilters", () => {
  const parse = (query: string) =>
    parseBrowseFilters(new URLSearchParams(query));

  it("defaults to Open, newest, no category", () => {
    expect(parse("")).toEqual({
      status: "Open",
      category: undefined,
      sort: "newest",
      query: "",
    });
  });

  it("reads shareable URL filters", () => {
    expect(
      parse("status=Claimed&category=Electronics&sort=reward&q=%20calc%20"),
    ).toEqual({
      status: "Claimed",
      category: "Electronics",
      sort: "reward",
      query: "calc",
    });
    expect(parse("status=completed").status).toBe("Completed");
    expect(parse("status=all").status).toBeUndefined();
  });

  it("falls back to defaults for unknown values", () => {
    expect(parse("status=Lost&category=Pets&sort=oldest")).toEqual({
      status: "Open",
      category: undefined,
      sort: "newest",
      query: "",
    });
  });
});

describe("placeItems", () => {
  const slots = Array.from({ length: 10 }, (_, index) => ({ x: index, y: 0 }));
  const items = (ids: number[]) =>
    ids.map((id) => ({ id: BigInt(id) }) as Item);

  it("is deterministic per item ID", () => {
    const first = placeItems(items([1, 2, 3]), slots);
    const again = placeItems(items([1, 2, 3]), slots);
    expect([...again]).toEqual([...first]);
  });

  it("never puts two items on one slot and stops when slots run out", () => {
    const placed = placeItems(
      items([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]),
      slots,
    );
    expect(placed.size).toBe(10);
    expect(new Set([...placed.values()].map((point) => point.x)).size).toBe(10);
  });
});

describe("daysAgo", () => {
  const now = new Date(2026, 9, 4, 15, 0);

  it("counts calendar days in the visitor's zone", () => {
    expect(daysAgo("2026-10-04", now)).toBe("today");
    expect(daysAgo("2026-10-03", now)).toBe("yesterday");
    expect(daysAgo("2026-10-01", now)).toBe("3d ago");
    expect(daysAgo("2026-08-01", now)).toBe("on 1 Aug 2026");
  });
});
