import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { UnauthorizedError } from "./auth";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function ok<T>(data: T, status = 200) {
  return NextResponse.json(data, { status });
}

export function fail(status: number, error: string, extra?: unknown) {
  return NextResponse.json({ error, details: extra }, { status });
}

/**
 * Wraps a route handler so every thrown error becomes a predictable JSON
 * response instead of an opaque 500.
 */
export function handler<Args extends unknown[]>(
  fn: (...args: Args) => Promise<Response>
) {
  return async (...args: Args): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        return fail(401, err.message);
      }
      if (err instanceof ApiError) {
        return fail(err.status, err.message);
      }
      if (err instanceof ZodError) {
        return fail(422, validationMessage(err), err.flatten().fieldErrors);
      }
      console.error("[api]", err);
      return fail(500, "Something went wrong on our end.");
    }
  };
}

/**
 * Turns a ZodError into a sentence naming what was actually wrong.
 *
 * The field errors were already being returned in `details`, but every form in
 * the app renders `error` alone, so all any of them could say was "Validation
 * failed" — which names no field, so there is nothing to go and fix. The
 * details stay in `details` for anything that wants to highlight a specific
 * input; this just makes the headline useful on its own.
 */
function validationMessage(err: ZodError): string {
  const [first] = err.issues;
  if (!first) return "Validation failed";

  const where = first.path.join(".");
  const rest = err.issues.length - 1;
  const more = rest > 0 ? ` (and ${rest} more)` : "";

  return where ? `${where}: ${first.message}${more}` : `${first.message}${more}`;
}

/** Parses `?page=&limit=` with sane bounds. */
export function pagination(url: URL, defaultLimit = 20, maxLimit = 50) {
  const page = Math.max(1, Number(url.searchParams.get("page") ?? 1) || 1);
  const limit = Math.min(
    maxLimit,
    Math.max(1, Number(url.searchParams.get("limit") ?? defaultLimit) || defaultLimit)
  );
  return { page, limit, skip: (page - 1) * limit };
}
