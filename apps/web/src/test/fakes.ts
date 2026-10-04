import { getAddress } from "viem";
import { vi } from "vitest";

/**
 * A stand-in for the Drizzle client: any chain of calls (`select().from().where()…`) records
 * its method names, and awaiting it resolves to the next queued result.
 */
export function fakeDb(results: unknown[] = []) {
  const queue = [...results];
  const calls: { method: string; args: unknown[] }[] = [];
  const chain = (): unknown =>
    new Proxy(() => {}, {
      get(_target, prop) {
        if (prop === "then") {
          const result = queue.shift();
          return (
            resolve: (v: unknown) => void,
            reject: (e: unknown) => void,
          ) => Promise.resolve(result).then(resolve, reject);
        }
        return (...args: unknown[]) => {
          calls.push({ method: String(prop), args });
          return chain();
        };
      },
    });
  const db = {
    select: (...args: unknown[]) => (
      calls.push({ method: "select", args }),
      chain()
    ),
    insert: (...args: unknown[]) => (
      calls.push({ method: "insert", args }),
      chain()
    ),
    update: (...args: unknown[]) => (
      calls.push({ method: "update", args }),
      chain()
    ),
    delete: (...args: unknown[]) => (
      calls.push({ method: "delete", args }),
      chain()
    ),
    execute: (...args: unknown[]) => (
      calls.push({ method: "execute", args }),
      chain()
    ),
    transaction: <T>(fn: (tx: unknown) => Promise<T>): Promise<T> => (
      calls.push({ method: "transaction", args: [] }),
      fn(db)
    ),
  };
  return { db, calls, queue };
}

export const WALLET = getAddress("0xc3094e09bb56e350bcdd9039ae2ce3e73d3900cf");

/** A Clerk backend `User`-shaped object. */
export function clerkUser({
  id = "user_1",
  email = "riya@college.edu.in",
  emailVerified = true,
  wallets = [WALLET],
  publicMetadata = {},
}: {
  id?: string;
  email?: string;
  emailVerified?: boolean;
  wallets?: string[];
  publicMetadata?: Record<string, unknown>;
} = {}) {
  return {
    id,
    primaryEmailAddressId: "email_1",
    emailAddresses: [
      {
        id: "email_1",
        emailAddress: email,
        verification: { status: emailVerified ? "verified" : "unverified" },
      },
    ],
    web3Wallets: wallets.map((web3Wallet) => ({
      web3Wallet,
      verification: { status: "verified" },
    })),
    publicMetadata,
    primaryEmailAddress: { emailAddress: email },
  };
}

export const clerkMocks = {
  auth: vi.fn(),
  currentUser: vi.fn(),
  updateUserMetadata: vi.fn(),
  getUser: vi.fn(),
};

/** `vi.mock("@clerk/nextjs/server", () => clerkServerModule())` */
export function clerkServerModule() {
  return {
    auth: clerkMocks.auth,
    currentUser: clerkMocks.currentUser,
    clerkClient: async () => ({
      users: {
        updateUserMetadata: clerkMocks.updateUserMetadata,
        getUser: clerkMocks.getUser,
      },
    }),
  };
}

/** Signs in `user` for the next requests (or signs out with `null`). */
export function signIn(user: ReturnType<typeof clerkUser> | null) {
  clerkMocks.auth.mockResolvedValue({ userId: user?.id ?? null });
  clerkMocks.currentUser.mockResolvedValue(user);
}

export function jsonRequest(url: string, body?: unknown, method = "POST") {
  return new Request(`http://localhost${url}`, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

export const params = <T>(value: T) => ({ params: Promise.resolve(value) });
