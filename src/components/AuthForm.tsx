"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { api, ApiClientError } from "@/lib/client";

type Mode = "login" | "register";

/** Shared login/register form (PRD Part 5 "Login/Register"). */
export function AuthForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") ?? "/";

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(params.get("error"));
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setFieldErrors({});

    try {
      await api(`/api/auth/${mode}`, {
        method: "POST",
        json: mode === "register" ? { name, email, password } : { email, password },
      });
      // Mark the welcome screen as seen so it never interrupts again.
      document.cookie = `xamvaad_seen_welcome=1; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
      router.push(next);
      router.refresh();
    } catch (err) {
      if (err instanceof ApiClientError && err.details) {
        setFieldErrors(err.details as Record<string, string[]>);
      }
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      {mode === "register" && (
        <Field
          label="Name"
          value={name}
          onChange={setName}
          autoComplete="name"
          errors={fieldErrors.name}
        />
      )}

      <Field
        label="Email"
        type="email"
        value={email}
        onChange={setEmail}
        autoComplete="email"
        errors={fieldErrors.email}
      />

      <Field
        label="Password"
        type="password"
        value={password}
        onChange={setPassword}
        autoComplete={mode === "register" ? "new-password" : "current-password"}
        errors={fieldErrors.password}
        hint={mode === "register" ? "At least 8 characters." : undefined}
      />

      {error && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-object">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={busy}
        className="w-full rounded-lg bg-brand-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-60"
      >
        {busy
          ? "Please wait..."
          : mode === "register"
            ? "Create Account"
            : "Login"}
      </button>

      <p className="pt-1 text-center text-sm text-ink-muted">
        {mode === "register" ? (
          <>
            Already have an account?{" "}
            <Link href="/login" className="font-semibold text-brand-600 hover:underline">
              Login
            </Link>
          </>
        ) : (
          <>
            New to Xamvaad?{" "}
            <Link href="/register" className="font-semibold text-brand-600 hover:underline">
              Create an account
            </Link>
          </>
        )}
      </p>
    </form>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  autoComplete,
  errors,
  hint,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  autoComplete?: string;
  errors?: string[];
  hint?: string;
}) {
  const id = `field-${label.toLowerCase()}`;
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-xs font-semibold text-ink">
        {label}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        autoComplete={autoComplete}
        onChange={(event) => onChange(event.target.value)}
        required
        className="w-full rounded-lg border border-hairline bg-canvas px-3 py-2.5 text-sm outline-none transition focus:border-brand-400 focus:bg-surface"
      />
      {hint && !errors?.length && (
        <p className="mt-1 text-xs text-ink-muted">{hint}</p>
      )}
      {errors?.map((message) => (
        <p key={message} className="mt-1 text-xs text-object">
          {message}
        </p>
      ))}
    </div>
  );
}
