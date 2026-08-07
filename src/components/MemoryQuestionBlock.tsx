"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import clsx from "clsx";
import { api } from "@/lib/client";
import { RECALL_CONFIDENCE, type RecallConfidenceKey } from "@/lib/rules";

type Option = {
  id: string;
  label: string;
  text: string | null;
  voteCount: number;
};

type VoteResult = { options: Option[]; votedOptionId: string };

/**
 * Memory Question card.
 *
 * A remembered question has no official answer — the key may not be out, and
 * the author is reconstructing the paper from memory. So instead of a key we
 * show two things: how well the author claims to recall the wording, and what
 * readers think the answer is.
 *
 * Kept to a single card on purpose. The Objection Question splits into four
 * because each part is a separate claim being voted on; here there is one
 * question and one tally, so splitting it would only add chrome.
 */
export function MemoryQuestionBlock({
  pollId,
  questionNumber,
  subject,
  questionText,
  options: initialOptions,
  votedOptionId: initialVoted,
  confidence,
  signedIn,
}: {
  pollId: string;
  questionNumber: number | null;
  subject: string | null;
  questionText: string;
  options: Option[];
  votedOptionId: string | null;
  confidence: RecallConfidenceKey | null;
  signedIn: boolean;
}) {
  const router = useRouter();
  const [options, setOptions] = useState(initialOptions);
  const [voted, setVoted] = useState(initialVoted);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const total = options.reduce((sum, o) => sum + o.voteCount, 0);
  const recall = confidence ? RECALL_CONFIDENCE[confidence] : null;

  // Results stay hidden until you answer, so the crowd can't anchor your pick.
  const revealed = Boolean(voted);

  async function vote(optionId: string) {
    if (!signedIn) {
      router.push("/login");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await api<VoteResult>(`/api/polls/${pollId}/vote`, {
        method: "POST",
        json: { optionId },
      });
      setOptions(result.options);
      setVoted(result.votedOptionId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save your answer.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="overflow-hidden rounded-xl border border-hairline bg-surface">
      {/* Header: identity of the question + the recall meter, on one line. */}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-hairline px-4 py-3">
        <p className="text-sm font-bold text-ink">
          {questionNumber ? `Q${questionNumber}` : "Remembered question"}
          {subject && (
            <span className="font-semibold text-ink-muted"> • {subject}</span>
          )}
        </p>

        {recall && <RecallMeter percent={recall.percent} label={recall.label} />}
      </div>

      <div className="px-4 py-4">
        <p className="text-[15px] leading-relaxed text-ink">{questionText}</p>

        <ul className="mt-4 space-y-2">
          {options.map((option) => {
            const mine = voted === option.id;
            const percent =
              total > 0 ? Math.round((option.voteCount / total) * 100) : 0;

            return (
              <li key={option.id}>
                <button
                  type="button"
                  onClick={() => vote(option.id)}
                  disabled={busy}
                  aria-pressed={mine}
                  className={clsx(
                    "relative w-full overflow-hidden rounded-lg border px-3 py-2.5 text-left text-sm transition disabled:opacity-60",
                    mine
                      ? "border-brand-500 bg-brand-50"
                      : "border-hairline hover:border-brand-300 hover:bg-canvas"
                  )}
                >
                  {/* Result bar sits behind the label once you've answered. */}
                  {revealed && (
                    <span
                      aria-hidden="true"
                      className={clsx(
                        "absolute inset-y-0 left-0 rounded-lg transition-all",
                        mine ? "bg-brand-100" : "bg-slate-100"
                      )}
                      style={{ width: `${percent}%` }}
                    />
                  )}

                  <span className="relative flex items-center gap-2">
                    <span
                      className={clsx(
                        "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                        mine
                          ? "bg-brand-600 text-white"
                          : "bg-slate-100 text-ink-muted"
                      )}
                    >
                      {mine ? <Check size={13} strokeWidth={3} /> : option.label}
                    </span>

                    <span className="min-w-0 flex-1 text-ink">
                      {option.text ?? option.label}
                    </span>

                    {revealed && (
                      <span className="shrink-0 text-xs font-semibold text-ink-muted">
                        {percent}%
                      </span>
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>

        <p className="mt-3 text-xs text-ink-muted">
          {!signedIn
            ? "Sign in to answer and see what others chose."
            : revealed
              ? `${total === 1 ? "1 answer" : `${total} answers`} so far. Tap another option to change yours.`
              : "Pick an answer to see what everyone else chose."}
        </p>

        {error && (
          <p role="alert" className="mt-2 text-xs text-object">
            {error}
          </p>
        )}
      </div>
    </section>
  );
}

/** Compact recall gauge — a short bar plus its percentage. */
function RecallMeter({ percent, label }: { percent: number; label: string }) {
  // Warmer as confidence drops, so a rough recollection reads as one at a glance.
  const tone =
    percent >= 95
      ? "bg-settled"
      : percent >= 85
        ? "bg-brand-500"
        : percent >= 70
          ? "bg-amber-500"
          : "bg-object";

  return (
    <div
      className="flex items-center gap-2"
      title={`Author's recall of the wording: ${label}`}
    >
      <span className="text-xs font-medium text-ink-muted">{label}</span>
      <span
        className="h-1.5 w-14 overflow-hidden rounded-full bg-slate-200"
        role="img"
        aria-label={`Recall confidence: ${label}, ${percent} percent`}
      >
        <span
          className={clsx("block h-full rounded-full", tone)}
          style={{ width: `${percent}%` }}
        />
      </span>
      <span className="text-xs font-bold tabular-nums text-ink">{percent}%</span>
    </div>
  );
}
