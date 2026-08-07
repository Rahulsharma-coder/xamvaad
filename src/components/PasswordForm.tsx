"use client";

import { useState } from "react";
import { api } from "@/lib/client";

/**
 * Set or change the account password.
 *
 * When `hasPassword` is false the account was created through Google, so there
 * is no current password to ask for — the form becomes "add a password" and
 * lets that user sign in with email as well.
 */
export function PasswordForm({ hasPassword }: { hasPassword: boolean }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const mismatch = confirm.length > 0 && next !== confirm;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (next !== confirm) {
      setError("The two passwords don't match.");
      return;
    }

    setBusy(true);
    setError(null);
    setDone(false);

    try {
      await api("/api/auth/password", {
        method: "POST",
        json: {
          currentPassword: hasPassword ? current : undefined,
          newPassword: next,
        },
      });
      setDone(true);
      setCurrent("");
      setNext("");
      setConfirm("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update password.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="rounded-xl border border-hairline bg-surface p-4"
    >
      <h2 className="text-sm font-bold text-ink">
        {hasPassword ? "Change password" : "Add a password"}
      </h2>
      <p className="mt-1 text-xs leading-relaxed text-ink-muted">
        {hasPassword
          ? "You'll stay signed in on this device."
          : "You signed up with Google. Adding a password lets you sign in with your email address too — Google sign-in keeps working either way."}
      </p>

      <div className="mt-3 space-y-3">
        {hasPassword && (
          <Field
            id="current-password"
            label="Current password"
            value={current}
            onChange={setCurrent}
            autoComplete="current-password"
            required
          />
        )}

        <Field
          id="new-password"
          label={hasPassword ? "New password" : "Password"}
          value={next}
          onChange={setNext}
          autoComplete="new-password"
          required
          hint="At least 8 characters."
        />

        <Field
          id="confirm-password"
          label="Confirm password"
          value={confirm}
          onChange={setConfirm}
          autoComplete="new-password"
          required
          error={mismatch ? "Passwords don't match." : undefined}
        />
      </div>

      {error && (
        <p role="alert" className="mt-2 text-xs text-object">
          {error}
        </p>
      )}
      {done && (
        <p role="status" className="mt-2 text-xs font-semibold text-correct">
          {hasPassword
            ? "Password changed."
            : "Password added. You can now sign in with your email."}
        </p>
      )}

      <button
        type="submit"
        disabled={busy || next.length < 8 || mismatch || (hasPassword && !current)}
        className="mt-3 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-50"
      >
        {busy ? "Saving..." : hasPassword ? "Change password" : "Add password"}
      </button>
    </form>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  autoComplete,
  required,
  hint,
  error,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: string;
  required?: boolean;
  hint?: string;
  error?: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-xs font-semibold text-ink">
        {label}
      </label>
      <input
        id={id}
        type="password"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        autoComplete={autoComplete}
        required={required}
        className="w-full rounded-lg border border-hairline bg-canvas px-3 py-2 text-sm outline-none transition focus:border-brand-400 focus:bg-surface"
      />
      {error ? (
        <p className="mt-1 text-[11px] text-object">{error}</p>
      ) : hint ? (
        <p className="mt-1 text-[11px] text-ink-muted">{hint}</p>
      ) : null}
    </div>
  );
}
