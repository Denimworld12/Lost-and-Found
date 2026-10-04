import { describe, expect, it } from "vitest";
import {
  detailErrors,
  EMPTY_POST_FORM,
  isDirty,
  parsedDetails,
  parseReward,
  todayLocal,
  toItemDetails,
} from "../post-form";

const MIN = 1_000_000_000_000_000n; // 0.001 ETH

describe("parseReward", () => {
  it("parses decimals to wei as bigint", () => {
    expect(parseReward("0.005", MIN)).toEqual({ wei: 5_000_000_000_000_000n });
    expect(parseReward(" .01 ", MIN)).toEqual({ wei: 10_000_000_000_000_000n });
    expect(parseReward("1", undefined)).toEqual({ wei: 10n ** 18n });
  });

  it("refuses empty, malformed and below-minimum values", () => {
    expect(parseReward("", MIN)).toEqual({ error: "Enter a reward." });
    expect(parseReward("abc", MIN)).toEqual({
      error: "Enter the reward as a number, like 0.005.",
    });
    expect(parseReward("1e-3", MIN)).toHaveProperty("error");
    expect(parseReward("0.0000000000000000001", MIN)).toHaveProperty("error");
    expect(parseReward("0.0009", MIN)).toEqual({
      error: "The reward must be at least 0.001 ETH.",
    });
  });
});

describe("detailErrors", () => {
  const valid = {
    ...EMPTY_POST_FORM,
    title: "Casio fx-991",
    category: "Electronics" as const,
    location: "Library, 2nd floor",
    lostOn: "2026-10-01",
  };

  it("passes a complete form and leaves an empty description out", () => {
    expect(detailErrors(valid)).toEqual({});
    expect(toItemDetails(valid).description).toBeUndefined();
    expect(parsedDetails(valid)).toMatchObject({ title: "Casio fx-991" });
  });

  it("explains each missing required field", () => {
    expect(detailErrors(EMPTY_POST_FORM)).toEqual({
      title: "Add a short title, up to 60 characters.",
      category: "Pick a category.",
      location: "Say where you lost it, up to 80 characters.",
      lostOn: "Pick the day you lost it.",
    });
  });

  it("refuses a date in the future and an over-long description", () => {
    expect(detailErrors({ ...valid, lostOn: "2999-01-01" }).lostOn).toBe(
      "The date can't be in the future.",
    );
    expect(
      detailErrors({ ...valid, description: "x".repeat(281) }).description,
    ).toBe("Keep the description under 280 characters.");
  });
});

describe("form helpers", () => {
  it("formats today in local time and spots a dirty form", () => {
    expect(todayLocal(new Date(2026, 9, 4, 23, 59))).toBe("2026-10-04");
    expect(isDirty(EMPTY_POST_FORM, false)).toBe(false);
    expect(isDirty(EMPTY_POST_FORM, true)).toBe(true);
    expect(isDirty({ ...EMPTY_POST_FORM, title: "a" }, false)).toBe(true);
  });
});
