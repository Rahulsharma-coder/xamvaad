"use client";

/** Thin fetch wrapper that surfaces the API's error message to the caller. */
export async function api<T = unknown>(
  path: string,
  init?: RequestInit & { json?: unknown }
): Promise<T> {
  const { json, ...rest } = init ?? {};

  const res = await fetch(path, {
    ...rest,
    headers: {
      ...(json ? { "Content-Type": "application/json" } : {}),
      ...rest.headers,
    },
    body: json ? JSON.stringify(json) : rest.body,
  });

  const payload = await res.json().catch(() => null);

  if (!res.ok) {
    const message =
      (payload as { error?: string } | null)?.error ??
      `Request failed (${res.status})`;
    throw new ApiClientError(message, res.status, (payload as { details?: unknown } | null)?.details);
  }

  return payload as T;
}

export class ApiClientError extends Error {
  constructor(
    message: string,
    public status: number,
    public details?: unknown
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}
