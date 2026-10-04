import { describe, expect, it, vi } from "vitest";
import {
  LockTimeoutError,
  withAdvisoryLock,
  type LockClient,
} from "../advisory-lock";

function fakeClient(lockedAfter: number) {
  const calls: string[] = [];
  let attempts = 0;
  const client: LockClient = {
    query: vi.fn(async (text: string) => {
      calls.push(text);
      if (text.includes("pg_try_advisory_lock")) {
        attempts++;
        return { rows: [{ locked: attempts > lockedAfter }] };
      }
      return { rows: [] };
    }),
  };
  return { client, calls };
}

const instant = { sleep: async () => {}, intervalMs: 1 };

describe("withAdvisoryLock", () => {
  it("runs the function while holding the lock, then unlocks", async () => {
    const { client, calls } = fakeClient(0);
    const result = await withAdvisoryLock(
      client,
      42,
      async () => "sent",
      instant,
    );
    expect(result).toBe("sent");
    expect(calls).toEqual([
      "select pg_try_advisory_lock($1) as locked",
      "select pg_advisory_unlock($1)",
    ]);
    expect(client.query).toHaveBeenCalledWith(expect.any(String), [42]);
  });

  it("waits while another instance holds the lock", async () => {
    const { client, calls } = fakeClient(3);
    await withAdvisoryLock(client, 42, async () => null, instant);
    expect(calls.filter((c) => c.includes("try"))).toHaveLength(4);
  });

  it("unlocks even when the function throws", async () => {
    const { client, calls } = fakeClient(0);
    await expect(
      withAdvisoryLock(
        client,
        42,
        async () => {
          throw new Error("nonce too low");
        },
        instant,
      ),
    ).rejects.toThrow("nonce too low");
    expect(calls.at(-1)).toBe("select pg_advisory_unlock($1)");
  });

  it("gives up after the timeout without running the function", async () => {
    const { client } = fakeClient(Infinity);
    let now = 0;
    const fn = vi.fn();
    await expect(
      withAdvisoryLock(client, 42, fn, {
        timeoutMs: 1000,
        intervalMs: 500,
        sleep: async (ms) => {
          now += ms;
        },
        now: () => now,
      }),
    ).rejects.toBeInstanceOf(LockTimeoutError);
    expect(fn).not.toHaveBeenCalled();
  });
});
