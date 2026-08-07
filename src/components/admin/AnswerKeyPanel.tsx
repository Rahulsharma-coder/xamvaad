"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, TriangleAlert } from "lucide-react";
import { api } from "@/lib/client";
import { Field, inputClass } from "./ui";

type Session = { id: string; label: string; questionCount: number };

type Result = {
  created: number;
  updated: number;
  notified: number;
  upheld: { number: number; from: string; to: string; percent: number }[];
};

/**
 * Answer key entry.
 *
 * Bulk paste rather than 100 separate inputs — an admin has the key as a list
 * and typing it question by question would guarantee mistakes. Accepts
 * "46: B" / "46 B" / "46-B", one per line, which covers how these are actually
 * copied out of a PDF.
 */
function parseKey(raw: string): {
  answers: { number: number; answer: string }[];
  errors: string[];
} {
  const answers: { number: number; answer: string }[] = [];
  const errors: string[] = [];

  raw
    .split(/[\n,;]+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .forEach((line, index) => {
      const match = line.match(/^(\d{1,3})\s*[:.\-\s]\s*([A-Da-d])$/);
      if (!match) {
        errors.push(`Line ${index + 1}: couldn't read "${line}"`);
        return;
      }
      answers.push({
        number: Number(match[1]),
        answer: match[2]!.toUpperCase(),
      });
    });

  return { answers, errors };
}

export function AnswerKeyPanel({
  examId,
  sessions,
}: {
  examId: string;
  sessions: Session[];
}) {
  const router = useRouter();
  const [sessionId, setSessionId] = useState(sessions[0]?.id ?? "");
  const [keyType, setKeyType] = useState<"PROVISIONAL" | "FINAL">("PROVISIONAL");
  const [raw, setRaw] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);

  const parsed = parseKey(raw);

  async function submit() {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const data = await api<Result>(`/api/admin/exams/${examId}/answer-key`, {
        method: "POST",
        json: { sessionId, keyType, answers: parsed.answers },
      });
      setResult(data);
      setRaw("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the key.");
    } finally {
      setBusy(false);
    }
  }

  if (sessions.length === 0) {
    return (
      <p className="text-sm text-ink-muted">
        Add shifts under Shifts &amp; Tags before entering an answer key.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Shift">
          <select
            value={sessionId}
            onChange={(e) => setSessionId(e.target.value)}
            className={inputClass}
          >
            {sessions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label} ({s.questionCount} questions)
              </option>
            ))}
          </select>
        </Field>

        <Field label="Which key">
          <select
            value={keyType}
            onChange={(e) =>
              setKeyType(e.target.value as "PROVISIONAL" | "FINAL")
            }
            className={inputClass}
          >
            <option value="PROVISIONAL">Provisional — can be challenged</option>
            <option value="FINAL">Final — closes objection voting</option>
          </select>
        </Field>
      </div>

      {keyType === "FINAL" && (
        <p className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800">
          <TriangleAlert size={14} className="mt-0.5 shrink-0" />
          Publishing the final key permanently closes voting on these questions.
          Where an answer differs from the provisional key, the community&apos;s
          objection is recorded as upheld and participants are notified.
        </p>
      )}

      <Field
        label="Answers"
        hint='One per line: "46: B", "46 B" or "46-B". Commas work too.'
      >
        <textarea
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          rows={8}
          placeholder={"1: A\n2: C\n3: B\n46: D"}
          className={`${inputClass} font-mono`}
        />
      </Field>

      <div className="flex flex-wrap items-center gap-3 text-xs">
        <span className="font-semibold text-ink">
          {parsed.answers.length} answer
          {parsed.answers.length === 1 ? "" : "s"} read
        </span>
        {parsed.errors.length > 0 && (
          <span className="text-object">
            {parsed.errors.length} line
            {parsed.errors.length === 1 ? "" : "s"} not understood
          </span>
        )}
      </div>

      {parsed.errors.length > 0 && (
        <ul className="max-h-24 overflow-y-auto rounded-lg bg-red-50 p-2 text-[11px] text-object">
          {parsed.errors.slice(0, 8).map((err) => (
            <li key={err}>{err}</li>
          ))}
        </ul>
      )}

      {result && (
        <div className="rounded-lg border border-hairline bg-canvas p-3 text-xs">
          <p className="font-semibold text-ink">
            {result.created} added, {result.updated} updated.
          </p>
          {result.upheld.length > 0 ? (
            <>
              <p className="mt-1.5 font-semibold text-settled">
                {result.upheld.length} community objection
                {result.upheld.length === 1 ? "" : "s"} upheld:
              </p>
              <ul className="mt-1 space-y-0.5 text-ink-muted">
                {result.upheld.map((u) => (
                  <li key={u.number}>
                    Q{u.number}: {u.from} → {u.to} ({u.percent}% had objected)
                  </li>
                ))}
              </ul>
              <p className="mt-1.5 text-ink-muted">
                {result.notified} aspirants notified.
              </p>
            </>
          ) : (
            <p className="mt-1 text-ink-muted">No answers changed.</p>
          )}
        </div>
      )}

      {error && (
        <p role="alert" className="text-xs font-medium text-object">
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={submit}
        disabled={busy || parsed.answers.length === 0}
        className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-50"
      >
        {busy && <Loader2 size={15} className="animate-spin" />}
        {busy
          ? "Publishing..."
          : keyType === "FINAL"
            ? "Publish final key"
            : "Publish provisional key"}
      </button>
    </div>
  );
}
