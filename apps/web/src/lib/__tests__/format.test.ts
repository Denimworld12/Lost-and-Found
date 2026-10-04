import { describe, expect, it } from "vitest";
import {
  countdown,
  formatDuration,
  formatEth,
  formatEthValue,
  relativeTime,
  shortAddress,
  shortHash,
} from "../format";

describe("formatEthValue", () => {
  it("shows at most 4 decimals and trims zeros", () => {
    expect(formatEthValue(10_000_000_000_000_000n)).toBe("0.01");
    expect(formatEthValue(1_000_000_000_000_000n)).toBe("0.001");
    expect(formatEthValue(500_000_000_000_000n)).toBe("0.0005");
    expect(formatEthValue(1_000_000_000_000_000_000n)).toBe("1");
  });

  it("rounds down so a balance is never overstated", () => {
    expect(formatEthValue(123_456_789_000_000_000n)).toBe("0.1234");
    expect(formatEthValue(99_999_000_000_000n)).toBe("<0.0001");
  });

  it("handles zero, large and negative amounts", () => {
    expect(formatEthValue(0n)).toBe("0");
    expect(formatEthValue(12_345n * 10n ** 18n)).toBe("12,345");
    expect(formatEthValue(-(10n ** 16n))).toBe("-0.01");
  });

  it("keeps precision beyond Number's range", () => {
    expect(formatEthValue(2n ** 128n - 1n)).toBe(
      "340,282,366,920,938,463,463.3746",
    );
  });

  it("adds the unit", () => {
    expect(formatEth(10n ** 16n)).toBe("0.01 ETH");
  });
});

describe("shortAddress / shortHash", () => {
  it("keeps the prefix and last four characters", () => {
    expect(shortAddress("0x4b0000000000000000000000000000000000091af")).toBe(
      "0x4b…91af",
    );
    expect(
      shortHash(
        "0x8b145b39d914fa55e0261d5f0ee3322bbe02f9b4a50ed60ac629b7d6f7fdec61",
      ),
    ).toBe("0x8b14…ec61");
  });

  it("leaves short strings alone", () => {
    expect(shortAddress("0x1234")).toBe("0x1234");
  });
});

describe("relativeTime", () => {
  const now = 1_700_000_000_000;
  const at = (secondsAgo: number) => BigInt(now / 1000 - secondsAgo);

  it("uses compact units", () => {
    expect(relativeTime(at(10), now)).toBe("just now");
    expect(relativeTime(at(5 * 60), now)).toBe("5m ago");
    expect(relativeTime(at(3 * 3600), now)).toBe("3h ago");
    expect(relativeTime(at(2 * 86_400), now)).toBe("2d ago");
  });

  it("treats future timestamps as now", () => {
    expect(relativeTime(at(-30), now)).toBe("just now");
  });
});

describe("countdown", () => {
  it("shows days and hours, then hours and minutes, then minutes", () => {
    expect(countdown(100n + 2n * 86_400n + 4n * 3600n, 100n)).toBe(
      "2d 04h left",
    );
    expect(countdown(3n * 3600n + 5n * 60n, 0n)).toBe("3h 05m left");
    expect(countdown(12n * 60n + 30n, 0n)).toBe("12m left");
    expect(countdown(20n, 0n)).toBe("1m left");
  });

  it("returns null once the end has passed", () => {
    expect(countdown(100n, 100n)).toBeNull();
    expect(countdown(100n, 200n)).toBeNull();
  });
});

describe("formatDuration", () => {
  it("names the two largest units", () => {
    expect(formatDuration(3n * 86_400n)).toBe("3 days");
    expect(formatDuration(5n * 60n)).toBe("5 minutes");
    expect(formatDuration(86_400n + 12n * 3600n + 60n)).toBe("1 day 12 hours");
    expect(formatDuration(30n)).toBe("30 seconds");
  });
});
