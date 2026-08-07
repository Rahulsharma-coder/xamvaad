"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { EyeOff, Loader2, Trash2, X } from "lucide-react";
import { api } from "@/lib/client";
import { Portal } from "@/components/Portal";
import { inputClass } from "./ui";

type Action = "HIDE" | "REMOVE" | "DISMISS";

const COPY: Record<Action, { title: string; body: string; cta: string }> = {
  HIDE: {
    title: "Hide this content?",
    body: "It disappears from every feed but can be restored later. The author is told why.",
    cta: "Hide it",
  },
  REMOVE: {
    title: "Remove this content?",
    body: "A stronger action than hiding. The row is retained for the audit trail, and the author is told why.",
    cta: "Remove it",
  },
  DISMISS: {
    title: "Dismiss this report?",
    body: "The content stays as it is and the report is closed. Nothing is sent to the author.",
    cta: "Dismiss",
  },
};

export function ReportActions({ reportId }: { reportId: string }) {
  const router = useRouter();
  const [action, setAction] = useState<Action | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    if (!action) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/api/admin/reports/${reportId}`, {
        method: "POST",
        json: { action, reason: reason.trim() || undefined },
      });
      setAction(null);
      setReason("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not do that.");
    } finally {
      setBusy(false);
    }
  }

  const needsReason = action === "HIDE" || action === "REMOVE";

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setAction("HIDE")}
          className="inline-flex items-center gap-1.5 rounded-lg border border-hairline px-2.5 py-1.5 text-xs font-semibold text-ink transition hover:bg-canvas"
        >
          <EyeOff size={13} />
          Hide
        </button>
        <button
          type="button"
          onClick={() => setAction("REMOVE")}
          className="inline-flex items-center gap-1.5 rounded-lg border border-hairline px-2.5 py-1.5 text-xs font-semibold text-object transition hover:bg-red-50"
        >
          <Trash2 size={13} />
          Remove
        </button>
        <button
          type="button"
          onClick={() => setAction("DISMISS")}
          className="inline-flex items-center gap-1.5 rounded-lg border border-hairline px-2.5 py-1.5 text-xs font-semibold text-ink-muted transition hover:bg-canvas"
        >
          <X size={13} />
          Dismiss
        </button>
      </div>

      {action && (
        <Portal>
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 p-4"
            onClick={() => (busy ? undefined : setAction(null))}
          >
            <div
              role="alertdialog"
              aria-modal="true"
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-sm rounded-2xl bg-surface p-5 shadow-xl"
            >
              <h2 className="text-base font-bold text-ink">
                {COPY[action].title}
              </h2>
              <p className="mt-2 text-sm text-ink-muted">{COPY[action].body}</p>

              {needsReason && (
                <label className="mt-3 block">
                  <span className="text-xs font-semibold text-ink">
                    Reason (shown to the author)
                  </span>
                  <input
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="e.g. Duplicate of an existing thread"
                    maxLength={300}
                    className={`${inputClass} mt-1.5`}
                    autoFocus
                  />
                </label>
              )}

              {error && (
                <p role="alert" className="mt-2 text-xs text-object">
                  {error}
                </p>
              )}

              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  onClick={() => setAction(null)}
                  disabled={busy}
                  className="flex-1 rounded-lg border border-hairline px-3 py-2 text-sm font-semibold text-ink transition hover:bg-canvas disabled:opacity-60"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={run}
                  disabled={busy || (needsReason && reason.trim().length === 0)}
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-50"
                >
                  {busy && <Loader2 size={14} className="animate-spin" />}
                  {COPY[action].cta}
                </button>
              </div>
            </div>
          </div>
        </Portal>
      )}
    </>
  );
}
