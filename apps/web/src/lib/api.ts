import { NextResponse } from "next/server";
import { z } from "zod";

// Our CSP forbids eval; without this zod probes `new Function`.
z.config({ jitless: true });

/** Error codes every API route can return in `{ error: { code, message } }`. */
export type ApiErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_ELIGIBLE"
  | "WALLET_NOT_LINKED"
  | "MULTIPLE_WALLETS"
  | "WALLET_TAKEN"
  | "NOT_VERIFIED"
  | "BAD_REQUEST"
  | "NOT_FOUND"
  | "CONFLICT"
  | "PAYLOAD_TOO_LARGE"
  | "UNSUPPORTED_MEDIA_TYPE"
  | "RATE_LIMITED"
  | "CHAIN_ERROR"
  | "NOT_CONFIGURED"
  | "INTERNAL";

export interface ApiErrorBody {
  error: { code: ApiErrorCode; message: string };
}

/**
 * An error with a status, a stable code and a message that is safe to show the user.
 * `detail` is for server logs only and never leaves the server.
 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ApiErrorCode,
    message: string,
    readonly detail?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function errorResponse(
  status: number,
  code: ApiErrorCode,
  message: string,
): NextResponse<ApiErrorBody> {
  return NextResponse.json({ error: { code, message } }, { status });
}

/** Converts anything thrown into a typed JSON error. Unknown errors become a generic 500. */
export function toErrorResponse(error: unknown): NextResponse<ApiErrorBody> {
  if (error instanceof ApiError) {
    if (error.status >= 500)
      console.error(`[api] ${error.code}: ${error.detail ?? error.message}`);
    return errorResponse(error.status, error.code, error.message);
  }
  if (error instanceof z.ZodError) {
    return errorResponse(400, "BAD_REQUEST", zodMessage(error));
  }
  console.error(
    "[api] unexpected error:",
    error instanceof Error ? `${error.name}: ${error.message}` : error,
  );
  return errorResponse(
    500,
    "INTERNAL",
    "Something went wrong on our side. Try again in a minute.",
  );
}

/** Wraps a route handler so every failure is a typed JSON error with no stack trace. */
export function handler<Args extends unknown[]>(
  fn: (...args: Args) => Promise<Response>,
): (...args: Args) => Promise<Response> {
  return async (...args) => {
    try {
      return await fn(...args);
    } catch (error) {
      return toErrorResponse(error);
    }
  };
}

/** First zod issue as one sentence, e.g. "title: Too big: expected string to have <=60 characters". */
export function zodMessage(error: z.ZodError): string {
  const issue = error.issues[0];
  if (!issue) return "The request is invalid.";
  const path = issue.path.join(".");
  return path ? `${path}: ${issue.message}` : issue.message;
}

/** Parses with a zod schema, throwing a 400 `ApiError` on failure. */
export function parse<T extends z.ZodType>(
  schema: T,
  value: unknown,
): z.infer<T> {
  const result = schema.safeParse(value);
  if (!result.success)
    throw new ApiError(400, "BAD_REQUEST", zodMessage(result.error));
  return result.data;
}

/** Reads and validates a JSON body; an empty or malformed body is a 400. */
export async function parseJson<T extends z.ZodType>(
  request: Request,
  schema: T,
): Promise<z.infer<T>> {
  let body: unknown;
  try {
    const text = await request.text();
    body = text ? JSON.parse(text) : {};
  } catch {
    throw new ApiError(
      400,
      "BAD_REQUEST",
      "The request body isn't valid JSON.",
    );
  }
  return parse(schema, body);
}

/** Validates dynamic route params. */
export async function parseParams<T extends z.ZodType>(
  params: Promise<unknown>,
  schema: T,
): Promise<z.infer<T>> {
  return parse(schema, await params);
}

/** JSON response; bigints become decimal strings (`JSON.stringify` throws on bigint). */
export function json<T>(data: T, init?: ResponseInit): Response {
  return new Response(
    JSON.stringify(data, (_key, value) =>
      typeof value === "bigint" ? value.toString() : value,
    ),
    {
      ...init,
      headers: { "content-type": "application/json", ...init?.headers },
    },
  );
}
