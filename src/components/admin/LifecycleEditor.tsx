"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Info, Loader2 } from "lucide-react";
import clsx from "clsx";
import { api } from "@/lib/client";
import { inputClass } from "./ui";
import { STAGE_LABEL, stageHasEnd } from "@/lib/lifecycle";
import type { ExamStage, StageStatus } from "@/prisma/client";

type Row = {
  stage: ExamStage;
  startsAt: string;
  endsAt: string;
  note: string;
  statusOverride: StageStatus | "" ;
  /** Derived from the dates on the server — shown so the admin sees the effect. */
  derived: StageStatus;
};

const ORDER: ExamStage[] = [
  "CONDUCTED",
  "ANSWER_KEY_RELEASED",
  "OBJECTION_WINDOW",
  "FINAL_KEY",
  "RESULT",
];

/** Hints shown under the stage name, where the meaning isn't obvious. */
const STAGE_HINT: Partial<Record<ExamStage, string>> = {
  CONDUCTED:
    "First to last sitting. Memory questions and cutoffs open on the start date.",
  OBJECTION_WINDOW: "While the official portal accepts challenges.",
};

export function LifecycleEditor({
  examId,
  phaseId,
  initial,
  shiftRange,
}: {
  examId: string;
  /** The tier whose lifecycle this edits — each has its own. */
  phaseId: string;
  initial: Row[];
  /**
   * First and last sitting already defined under Shifts & Tags. The exam
   * window is almost always exactly this, so it is offered as one click
   * rather than retyped — and retyping is where the two drift apart.
   */
  shiftRange?: { start: string; end: string } | null;
}) {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>(initial);
  const [suppress, setSuppress] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function update(stage: ExamStage, patch: Partial<Row>) {
    setRows((current) =>
      current.map((row) => (row.stage === stage ? { ...row, ...patch } : row))
    );
  }

  async function save() {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const result = await api<{
        notificationsSent: number;
        announced: string[];
      }>(`/api/admin/exams/${examId}/stages`, {
        method: "PATCH",
        json: {
          phaseId,
          suppressAnnouncements: suppress,
          stages: rows.map((row) => ({
            stage: row.stage,
            startsAt: row.startsAt || null,
            endsAt: stageHasEnd(row.stage) ? row.endsAt || null : null,
            note: row.note.trim() || null,
            statusOverride: row.statusOverride || null,
          })),
        },
      });

      setMessage(
        result.announced.length > 0
          ? `Saved. Announced: ${result.announced.join("; ")} — ${result.notificationsSent} notifications sent.`
          : "Saved. No new announcements were due."
      );
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-hairline text-left text-xs text-ink-muted">
              <th className="pb-2 font-semibold">Stage</th>
              <th className="pb-2 font-semibold">Starts</th>
              <th className="pb-2 font-semibold">Ends</th>
              <th className="pb-2 font-semibold">Status</th>
              <th className="pb-2 font-semibold">Override</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-hairline">
            {ORDER.map((stage) => {
              const row = rows.find((r) => r.stage === stage)!;
              const rangeStage = stageHasEnd(stage);
              const hint = STAGE_HINT[stage];

              return (
                <tr key={stage}>
                  <td className="py-2.5 pr-3 align-top">
                    <span className="font-semibold text-ink">
                      {STAGE_LABEL[stage]}
                    </span>
                    {hint && (
                      <span className="mt-0.5 block max-w-[13rem] text-[10px] leading-tight text-ink-muted">
                        {hint}
                      </span>
                    )}
                  </td>
                  <td className="py-2.5 pr-3 align-top">
                    <input
                      type="date"
                      value={row.startsAt}
                      onChange={(e) =>
                        update(stage, { startsAt: e.target.value })
                      }
                      className={inputClass}
                    />
                    {/* The one shortcut worth having: the sittings are
                        already entered, so the window shouldn't be retyped. */}
                    {stage === "CONDUCTED" && shiftRange && (
                      <button
                        type="button"
                        onClick={() =>
                          update("CONDUCTED", {
                            startsAt: shiftRange.start,
                            endsAt: shiftRange.end,
                          })
                        }
                        className="mt-1 text-[10px] font-semibold text-brand-600 underline-offset-2 hover:underline"
                      >
                        Use shift dates ({shiftRange.start}
                        {shiftRange.end !== shiftRange.start &&
                          ` → ${shiftRange.end}`}
                        )
                      </button>
                    )}
                  </td>
                  <td className="py-2.5 pr-3 align-top">
                    {rangeStage ? (
                      <input
                        type="date"
                        value={row.endsAt}
                        onChange={(e) =>
                          update(stage, { endsAt: e.target.value })
                        }
                        className={inputClass}
                      />
                    ) : (
                      <span className="text-xs text-ink-muted">—</span>
                    )}
                  </td>
                  <td className="py-2.5 pr-3 align-top">
                    <StatusPill status={row.derived} />
                  </td>
                  <td className="py-2.5 align-top">
                    <select
                      value={row.statusOverride}
                      onChange={(e) =>
                        update(stage, {
                          statusOverride: e.target.value as StageStatus | "",
                        })
                      }
                      className={inputClass}
                    >
                      <option value="">Follow dates</option>
                      <option value="PENDING">Force pending</option>
                      <option value="ACTIVE">Force active</option>
                      <option value="DONE">Force done</option>
                    </select>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <label className="mt-4 block">
        <span className="text-xs font-semibold text-ink">
          Note on the active stage
        </span>
        <input
          value={rows.find((r) => r.stage === "OBJECTION_WINDOW")?.note ?? ""}
          onChange={(e) => update("OBJECTION_WINDOW", { note: e.target.value })}
          placeholder="e.g. Objections accepted on the official portal, Rs. 100 per question"
          className={`${inputClass} mt-1.5`}
          maxLength={300}
        />
      </label>

      <label className="mt-3 flex items-start gap-2 text-xs text-ink-muted">
        <input
          type="checkbox"
          checked={suppress}
          onChange={(e) => setSuppress(e.target.checked)}
          className="mt-0.5 accent-brand-600"
        />
        <span>
          Don&apos;t notify anyone about dates already in the past. Tick this
          when backfilling an older exam.
        </span>
      </label>

      <div className="mt-3 flex items-start gap-2 rounded-lg bg-canvas p-3 text-xs text-ink-muted">
        <Info size={14} className="mt-0.5 shrink-0" />
        <span>
          Status is worked out from these dates, so the lifecycle meter, the
          exam window and the objection window open and close on their own. End
          dates count as the whole day. Until the exam window opens, aspirants
          can only post Discussions and Polls for this phase. Everyone who has
          taken part is notified once per transition — use an override only when
          the authority departs from its own schedule.
        </span>
      </div>

      {message && (
        <p role="status" className="mt-3 text-xs font-medium text-settled">
          {message}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-3 text-xs font-medium text-object">
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={save}
        disabled={busy}
        className="mt-4 inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-60"
      >
        {busy && <Loader2 size={15} className="animate-spin" />}
        {busy ? "Saving..." : "Save lifecycle"}
      </button>
    </div>
  );
}

function StatusPill({ status }: { status: StageStatus }) {
  const tone = {
    DONE: "bg-brand-50 text-brand-700",
    ACTIVE: "bg-emerald-50 text-settled",
    PENDING: "bg-slate-100 text-ink-muted",
  }[status];

  return (
    <span
      className={clsx(
        "inline-block rounded-full px-2 py-0.5 text-[11px] font-bold",
        tone
      )}
    >
      {status === "DONE" ? "Done" : status === "ACTIVE" ? "Active" : "Pending"}
    </span>
  );
}
