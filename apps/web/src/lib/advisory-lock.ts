/** Minimal session-bound SQL client: one connection, so lock and unlock hit the same session. */
export interface LockClient {
  query(
    text: string,
    params?: unknown[],
  ): Promise<{ rows: Record<string, unknown>[] }>;
}

export class LockTimeoutError extends Error {
  constructor(key: number, timeoutMs: number) {
    super(`Advisory lock ${key} not acquired within ${timeoutMs} ms`);
    this.name = "LockTimeoutError";
  }
}

export interface LockOptions {
  timeoutMs?: number;
  intervalMs?: number;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

/**
 * Runs `fn` while holding Postgres session advisory lock `key`. Polls `pg_try_advisory_lock`
 * instead of blocking in `pg_advisory_lock`, so a stuck holder makes this request fail after
 * `timeoutMs` rather than hang until the serverless function is killed.
 */
export async function withAdvisoryLock<T>(
  client: LockClient,
  key: number,
  fn: () => Promise<T>,
  {
    timeoutMs = 60_000,
    intervalMs = 500,
    sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    now = Date.now,
  }: LockOptions = {},
): Promise<T> {
  const deadline = now() + timeoutMs;
  for (;;) {
    const { rows } = await client.query(
      "select pg_try_advisory_lock($1) as locked",
      [key],
    );
    if (rows[0]?.locked === true) break;
    if (now() >= deadline) throw new LockTimeoutError(key, timeoutMs);
    await sleep(intervalMs);
  }
  try {
    return await fn();
  } finally {
    await client.query("select pg_advisory_unlock($1)", [key]);
  }
}
