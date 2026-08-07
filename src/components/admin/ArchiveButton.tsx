"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Archive, ArchiveRestore, Loader2 } from "lucide-react";
import { api } from "@/lib/client";
import { Portal } from "@/components/Portal";

export function ArchiveButton({
  examId,
  examName,
  archived,
}: {
  examId: string;
  examName: string;
  archived: boolean;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/admin/exams/${examId}/archive`, { method: "POST" });
      setConfirming(false);
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
        onClick={() => setConfirming(true)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-hairline bg-surface px-3 py-2 text-xs font-semibold text-ink transition hover:bg-canvas"
      >
        {archived ? <ArchiveRestore size={14} /> : <Archive size={14} />}
        {archived ? "Restore" : "Archive"}
      </button>

      {confirming && (
        <Portal>
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 p-4"
            onClick={() => (busy ? undefined : setConfirming(false))}
          >
            <div
              role="alertdialog"
              aria-modal="true"
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-sm rounded-2xl bg-surface p-5 shadow-xl"
            >
              <h2 className="text-base font-bold text-ink">
                {archived ? "Restore" : "Archive"} {examName}?
              </h2>
              <p className="mt-2 text-sm text-ink-muted">
                {archived
                  ? "It returns to active listings and accepts new posts again."
                  : "It becomes read-only and leaves active listings. Nothing is deleted — every discussion stays searchable."}
              </p>

              {error && (
                <p role="alert" className="mt-2 text-xs text-object">
                  {error}
                </p>
              )}

              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  disabled={busy}
                  className="flex-1 rounded-lg border border-hairline px-3 py-2 text-sm font-semibold text-ink transition hover:bg-canvas disabled:opacity-60"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={run}
                  disabled={busy}
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-60"
                >
                  {busy && <Loader2 size={14} className="animate-spin" />}
                  {archived ? "Restore" : "Archive"}
                </button>
              </div>
            </div>
          </div>
        </Portal>
      )}
    </>
  );
}
