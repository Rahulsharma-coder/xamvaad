"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, ShieldOff, UserCheck } from "lucide-react";
import { api } from "@/lib/client";
import { Portal } from "@/components/Portal";
import { Field, inputClass } from "./ui";

const DURATIONS = [
  { value: 1, label: "1 day" },
  { value: 7, label: "7 days" },
  { value: 30, label: "30 days" },
  { value: 0, label: "Permanent" },
];

export function BanButton({
  userId,
  userName,
  banned,
}: {
  userId: string;
  userName: string;
  banned: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [days, setDays] = useState(7);
  const [reason, setReason] = useState("");
  const [hideContent, setHideContent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      if (banned) {
        await api(`/api/admin/users/${userId}/ban`, { method: "DELETE" });
      } else {
        await api(`/api/admin/users/${userId}/ban`, {
          method: "POST",
          json: { days: days === 0 ? null : days, reason, hideContent },
        });
      }
      setOpen(false);
      setReason("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not do that.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => (banned ? submit() : setOpen(true))}
        disabled={busy}
        className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition disabled:opacity-60 ${
          banned
            ? "border-hairline text-settled hover:bg-emerald-50"
            : "border-hairline text-object hover:bg-red-50"
        }`}
      >
        {busy ? (
          <Loader2 size={13} className="animate-spin" />
        ) : banned ? (
          <UserCheck size={13} />
        ) : (
          <ShieldOff size={13} />
        )}
        {banned ? "Unblock" : "Block user"}
      </button>

      {open && (
        <Portal>
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 p-4"
            onClick={() => (busy ? undefined : setOpen(false))}
          >
            <div
              role="alertdialog"
              aria-modal="true"
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-sm rounded-2xl bg-surface p-5 shadow-xl"
            >
              <h2 className="text-base font-bold text-ink">Block {userName}?</h2>
              <p className="mt-1 text-sm text-ink-muted">
                They can&apos;t sign in while blocked. A timed block lifts itself.
              </p>

              <div className="mt-4 space-y-3">
                <Field label="Duration">
                  <select
                    value={days}
                    onChange={(e) => setDays(Number(e.target.value))}
                    className={inputClass}
                  >
                    {DURATIONS.map((d) => (
                      <option key={d.value} value={d.value}>
                        {d.label}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field label="Reason">
                  <input
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="e.g. Repeated spam across SSC threads"
                    maxLength={300}
                    className={inputClass}
                    autoFocus
                  />
                </Field>

                <label className="flex items-start gap-2 text-xs text-ink-muted">
                  <input
                    type="checkbox"
                    checked={hideContent}
                    onChange={(e) => setHideContent(e.target.checked)}
                    className="mt-0.5 accent-brand-600"
                  />
                  <span>
                    Also hide everything they&apos;ve posted. Right for a
                    spammer; harsh for someone suspended over one argument.
                  </span>
                </label>
              </div>

              {error && (
                <p role="alert" className="mt-2 text-xs text-object">
                  {error}
                </p>
              )}

              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  disabled={busy}
                  className="flex-1 rounded-lg border border-hairline px-3 py-2 text-sm font-semibold text-ink transition hover:bg-canvas disabled:opacity-60"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={submit}
                  disabled={busy || reason.trim().length < 3}
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-object px-3 py-2 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-50"
                >
                  {busy && <Loader2 size={14} className="animate-spin" />}
                  Block
                </button>
              </div>
            </div>
          </div>
        </Portal>
      )}
    </>
  );
}
