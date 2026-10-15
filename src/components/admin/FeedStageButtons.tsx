"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { api } from "@/lib/client";

/**
 * One button per phase, for a feed update whose phase the job couldn't tell.
 * Choosing one marks the stage on that phase's lifecycle.
 */
export function FeedStageButtons({
  itemId,
  stageLabel,
  phases,
}: {
  itemId: string;
  stageLabel: string;
  phases: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function mark(phaseId: string) {
    setBusy(phaseId);
    setError(null);
    try {
      await api(`/api/admin/feed-items/${itemId}/stage`, {
        method: "POST",
        json: { phaseId },
      });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not mark the stage.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mt-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] font-semibold text-ink-muted">
          Mark {stageLabel} on:
        </span>
        {phases.map((phase) => (
          <button
            key={phase.id}
            type="button"
            disabled={busy !== null}
            onClick={() => mark(phase.id)}
            className="inline-flex items-center gap-1 rounded-full border border-hairline px-2.5 py-1 text-[11px] font-semibold text-ink transition hover:border-brand-300 disabled:opacity-50"
          >
            {busy === phase.id && <Loader2 size={11} className="animate-spin" />}
            {phase.name}
          </button>
        ))}
      </div>
      {error && <p className="mt-1 text-xs text-object">{error}</p>}
    </div>
  );
}
