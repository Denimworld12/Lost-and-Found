import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  ApiError,
  handler,
  json,
  parse,
  parseJson,
  toErrorResponse,
} from "../api";

afterEach(() => vi.restoreAllMocks());

describe("toErrorResponse", () => {
  it("returns an ApiError's status, code and message", async () => {
    const response = toErrorResponse(
      new ApiError(403, "FORBIDDEN", "No access."),
    );
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: { code: "FORBIDDEN", message: "No access." },
    });
  });

  it("never sends an ApiError's server-side detail", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const response = toErrorResponse(
      new ApiError(
        503,
        "NOT_CONFIGURED",
        "Not set up yet.",
        "VERIFIER_PRIVATE_KEY is not set",
      ),
    );
    const text = await response.text();
    expect(text).not.toContain("VERIFIER_PRIVATE_KEY");
  });

  it("turns unknown errors into a generic 500 with no stack or message", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const response = toErrorResponse(
      new Error("connect ECONNREFUSED postgres://user:pw@db"),
    );
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error.code).toBe("INTERNAL");
    expect(JSON.stringify(body)).not.toMatch(/ECONNREFUSED|postgres|at /);
  });

  it("maps zod errors to 400", async () => {
    const result = z.object({ a: z.string() }).safeParse({});
    const response = toErrorResponse(result.error);
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("BAD_REQUEST");
  });
});

describe("handler", () => {
  it("catches anything the route throws", async () => {
    const route = handler(async () => {
      throw new ApiError(401, "UNAUTHENTICATED", "Sign in to continue.");
    });
    const response = await route();
    expect(response.status).toBe(401);
  });
});

describe("parse / parseJson", () => {
  const schema = z.object({ note: z.string().max(3) }).strict();

  it("names the failing field", () => {
    expect(() => parse(schema, { note: "toolong" })).toThrowError(/^note:/);
  });

  it("rejects malformed JSON and unknown keys with 400", async () => {
    const bad = new Request("http://x", { method: "POST", body: "{" });
    await expect(parseJson(bad, schema)).rejects.toMatchObject({ status: 400 });
    const extra = new Request("http://x", {
      method: "POST",
      body: '{"note":"a","x":1}',
    });
    await expect(parseJson(extra, schema)).rejects.toMatchObject({
      status: 400,
    });
  });

  it("treats an empty body as {}", async () => {
    const empty = new Request("http://x", { method: "POST" });
    await expect(parseJson(empty, z.object({}).strict())).resolves.toEqual({});
  });
});

describe("json", () => {
  it("serialises bigint as a decimal string", async () => {
    const response = json({ wei: 10n ** 18n });
    expect(await response.json()).toEqual({ wei: "1000000000000000000" });
  });
});
