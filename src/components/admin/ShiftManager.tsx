"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { api } from "@/lib/client";
import { Field, inputClass } from "./ui";

type Session = {
  id: string;
  date: string;
  shift: string;
  posts: number;
  questions: number;
};

/**
 * Shift definition, per the official notification.
 *
 * Bulk by design: a notification lists several dates each with the same two or
 * three shifts, and adding twelve rows one at a time is how mistakes creep in.
 */
export function ShiftManager({
  examId,
  examName,
  phases,
}: {
  examId: string;
  examName: string;
  phases: { id: string; name: string; sessions: Session[] }[];
}) {
  const router = useRouter();
  const [phaseId, setPhaseId] = useState(phases[0]?.id ?? "");
  const [dates, setDates] = useState("");
  const [shifts, setShifts] = useState("Shift 1, Shift 2");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const dateList = dates
    .split(/[\n,]+/)
    .map((d) => d.trim())
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d));
  const shiftList = shifts
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const preview = dateList.flatMap((date) =>
    shiftList.map((shift) => ({ date, shift }))
  );

  // Only the selected tier's sittings are listed, so the table matches what
  // "Add shifts" will actually touch.
  const sessions = phases.find((p) => p.id === phaseId)?.sessions ?? [];

  async function add() {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const result = await api<{ created: number; skipped: number }>(
        `/api/admin/exams/${examId}/sessions`,
        { method: "POST", json: { phaseId, sessions: preview } }
      );
      setMessage(
        `${result.created} added${result.skipped ? `, ${result.skipped} already existed` : ""}.`
      );
      setDates("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add shifts.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(sessionId: string) {
    setError(null);
    try {
      await api(`/api/admin/exams/${examId}/sessions?sessionId=${sessionId}`, {
        method: "DELETE",
      });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove it.");
    }
  }

  return (
    <div>
      <h3 className="text-sm font-bold text-ink">{examName}</h3>

      {/* Shifts belong to a tier: Tier 1 and Tier 2 each hold their own
          "Shift 1" months apart. */}
      <div className="mt-3">
        <Field label="Phase">
          <select
            value={phaseId}
            onChange={(e) => setPhaseId(e.target.value)}
            className={inputClass}
          >
            {phases.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.sessions.length} shifts)
              </option>
            ))}
          </select>
        </Field>
      </div>

      {sessions.length > 0 && (
        <ul className="mt-3 divide-y divide-hairline border-y border-hairline">
          {sessions.map((session) => {
            const locked = session.posts > 0 || session.questions > 0;
            return (
              <li
                key={session.id}
                className="flex items-center justify-between gap-3 py-2"
              >
                <span className="text-sm text-ink">
                  {session.date} · {session.shift}
                </span>
                <span className="flex items-center gap-3">
                  <span className="text-[11px] text-ink-muted">
                    {session.posts} posts · {session.questions} qs
                  </span>
                  <button
                    type="button"
                    onClick={() => remove(session.id)}
                    disabled={locked}
                    title={
                      locked
                        ? "Has content — only empty shifts can be deleted"
                        : "Delete this shift"
                    }
                    className="rounded p-1 text-ink-muted transition hover:bg-red-50 hover:text-object disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    <Trash2 size={14} />
                  </button>
                </span>
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Field label="Dates" hint="YYYY-MM-DD, one per line or comma separated">
          <textarea
            value={dates}
            onChange={(e) => setDates(e.target.value)}
            rows={3}
            placeholder={"2026-08-05\n2026-08-06"}
            className={`${inputClass} font-mono`}
          />
        </Field>
        <Field label="Shifts" hint="Comma separated, applied to every date">
          <input
            value={shifts}
            onChange={(e) => setShifts(e.target.value)}
            className={inputClass}
          />
        </Field>
      </div>

      {preview.length > 0 && (
        <p className="mt-2 text-xs text-ink-muted">
          Will create <strong className="text-ink">{preview.length}</strong>{" "}
          sittings ({dateList.length} dates × {shiftList.length} shifts).
        </p>
      )}

      {message && <p className="mt-2 text-xs text-settled">{message}</p>}
      {error && <p className="mt-2 text-xs text-object">{error}</p>}

      <button
        type="button"
        onClick={add}
        disabled={busy || preview.length === 0}
        className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-brand-700 disabled:opacity-50"
      >
        {busy ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
        Add shifts
      </button>
    </div>
  );
}
