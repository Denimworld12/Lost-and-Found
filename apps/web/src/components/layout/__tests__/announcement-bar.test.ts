import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ANNOUNCEMENT_STORAGE_KEY,
  isAnnouncementDismissed,
} from "../announcement-bar";

function stubStorage(values: Record<string, string>) {
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => values[key] ?? null,
  });
}

describe("isAnnouncementDismissed", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("is false before the bar is dismissed", () => {
    stubStorage({});
    expect(isAnnouncementDismissed()).toBe(false);
  });

  it("is true once the dismissal is stored", () => {
    stubStorage({ [ANNOUNCEMENT_STORAGE_KEY]: "1" });
    expect(isAnnouncementDismissed()).toBe(true);
  });

  it("is false when storage is blocked", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("SecurityError");
      },
    });
    expect(isAnnouncementDismissed()).toBe(false);
  });
});
