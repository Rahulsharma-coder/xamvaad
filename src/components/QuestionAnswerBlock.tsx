"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import clsx from "clsx";
import { api } from "@/lib/client";

type Option = {
  id: string;
  label: string;
  text: string;
  markCount: number;
};

type MarkResult = {
  options: Option[];
  totalMarks: number;
  myOptionId: string;
};

/**
 * The question card of an Objection Question post: the paper's wording, its
 * four choices, the official key, and what the community says they marked.
 *
 * The objection vote itself lives in a separate block below this one — what
 * you marked and whether the key is wrong are different claims.
 */
export function QuestionAnswerBlock({
  questionId,
  questionNumber,
  subject,
  questionText,
  options: initialOptions,
  officialAnswer,
  myOptionId: initialMyOptionId,
  signedIn,
}: {
  questionId: string;
  questionNumber: number;
  subject: string | null;
  questionText: string;
  options: Option[];
  officialAnswer: string | null;
  myOptionId: string | null;
  signedIn: boolean;
}) {
  const router = useRouter();
  const [options, setOptions] = useState(initialOptions);
  const [myOptionId, setMyOptionId] = useState(initialMyOptionId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const totalMarks = options.reduce((sum, o) => sum + o.markCount, 0);

  async function mark(optionId: string) {
    if (!signedIn) {
      router.push("/login");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await api<MarkResult>(
        `/api/questions/${questionId}/mark`,
        { method: "POST", json: { optionId } }
      );
      setOptions(result.options);
      setMyOptionId(result.myOptionId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save your answer.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      {/* --- The question itself ------------------------------------------ */}
      <section className="rounded-xl border border-hairline bg-surface p-4">
        <p className="text-sm font-bold text-ink">
          Q{questionNumber}
          {subject && (
            <span className="font-semibold text-ink-muted"> • {subject}</span>
          )}
        </p>

        <p className="mt-2 text-[15px] leading-relaxed text-ink">
          {questionText}
        </p>

        <ul className="mt-4 grid gap-2 sm:grid-cols-2">
          {options.map((option) => {
            const isKey = officialAnswer === option.label;
            return (
              <li
                key={option.id}
                className={clsx(
                  "rounded-lg border px-3 py-2.5 text-center text-sm",
                  isKey
                    ? "border-settled bg-emerald-50 font-semibold text-ink"
                    : "border-hairline text-ink"
                )}
              >
                <span className="font-semibold">{option.label}.</span>{" "}
                {option.text}
              </li>
            );
          })}
        </ul>

        <div className="mt-4 flex items-center justify-between border-t border-hairline pt-3">
          <span className="text-sm font-semibold text-ink">Official answer</span>
          {officialAnswer ? (
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100 text-xs font-bold text-settled">
              {officialAnswer}
            </span>
          ) : (
            <span className="text-xs text-ink-muted">Not published yet</span>
          )}
        </div>
      </section>

      {/* --- What did you mark? ------------------------------------------- */}
      <section className="rounded-xl border border-hairline bg-surface p-4">
        <h3 className="text-sm font-bold text-ink">What did you mark?</h3>

        <ul className="mt-3 grid grid-cols-4 gap-2">
          {options.map((option) => {
            const mine = myOptionId === option.id;
            return (
              <li key={option.id}>
                <button
                  type="button"
                  onClick={() => mark(option.id)}
                  disabled={busy}
                  aria-pressed={mine}
                  className={clsx(
                    "flex w-full items-center justify-center gap-1 rounded-lg border px-2 py-2.5 text-sm font-semibold transition disabled:opacity-60",
                    mine
                      ? "border-brand-500 bg-brand-50 text-brand-700"
                      : "border-hairline text-ink hover:bg-canvas"
                  )}
                >
                  {mine && <Check size={14} strokeWidth={3} />}
                  {option.label}
                </button>
              </li>
            );
          })}
        </ul>

        {!signedIn && (
          <p className="mt-2 text-xs text-ink-muted">
            Sign in to record what you marked.
          </p>
        )}
        {error && (
          <p role="alert" className="mt-2 text-xs text-object">
            {error}
          </p>
        )}
      </section>

      {/* --- Community marked --------------------------------------------- */}
      <section className="rounded-xl border border-hairline bg-surface p-4">
        <div className="flex items-baseline justify-between">
          <h3 className="text-sm font-bold text-ink">Community marked</h3>
          <span className="text-xs text-ink-muted">
            {totalMarks === 1 ? "1 response" : `${totalMarks} responses`}
          </span>
        </div>

        {totalMarks === 0 ? (
          <p className="mt-3 text-sm text-ink-muted">
            No one has recorded an answer yet. Be the first.
          </p>
        ) : (
          <ul className="mt-3 space-y-2.5">
            {options.map((option) => {
              const percent = Math.round((option.markCount / totalMarks) * 100);
              const isKey = officialAnswer === option.label;
              return (
                <li key={option.id}>
                  <div className="flex items-baseline justify-between text-sm">
                    <span className="font-medium text-ink">
                      {option.label}
                      {myOptionId === option.id && (
                        <span className="ml-1.5 text-xs text-brand-600">
                          your answer
                        </span>
                      )}
                    </span>
                    <span className="text-ink-muted">{percent}%</span>
                  </div>
                  <div
                    className="mt-1 h-2 overflow-hidden rounded-full bg-slate-200"
                    role="img"
                    aria-label={`${option.label}: ${percent} percent, ${option.markCount} responses`}
                  >
                    <div
                      className={clsx(
                        "h-full rounded-full",
                        isKey ? "bg-settled" : "bg-brand-500"
                      )}
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {officialAnswer && totalMarks > 0 && (
          <p className="mt-3 text-xs text-ink-muted">
            The green bar is the option the official key marks correct.
          </p>
        )}
      </section>
    </div>
  );
}
