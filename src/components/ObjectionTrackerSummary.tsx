import Link from "next/link";
import clsx from "clsx";
import { ShieldQuestion } from "lucide-react";
import { OBJECTION_LABEL, objectionLevel, objectionPercent } from "@/lib/rules";
import { objectionTone } from "./ObjectionMeter";

type Question = {
  id: string;
  number: number;
  objectVotes: number;
  correctVotes: number;
};

/** The Objection Tracker tab's summary card — wireframe 07. */
export function ObjectionTrackerSummary({
  questions,
  examSlug,
  phaseSlug,
}: {
  questions: Question[];
  examSlug: string;
  /** Keeps the selected tier when opening the full tracker. */
  phaseSlug?: string;
}) {
  return (
    <section className="rounded-xl border border-hairline bg-surface p-4">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-bold text-ink">Objection Tracker</h2>
          <p className="mt-1 text-xs text-ink-muted">
            Questions the community believes might need objection.
          </p>
        </div>
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
          <ShieldQuestion size={24} strokeWidth={2.2} />
        </span>
      </div>

      {questions.length === 0 ? (
        <p className="mt-4 rounded-lg bg-canvas px-3 py-4 text-center text-sm text-ink-muted">
          No questions are being tracked for this shift yet.
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-hairline">
          {questions.map((question) => {
            const percent = objectionPercent(
              question.objectVotes,
              question.correctVotes
            );
            const level = objectionLevel(
              question.objectVotes,
              question.correctVotes
            );
            const tone = objectionTone(level);

            return (
              <li key={question.id}>
                <Link
                  href={`/exams/${examSlug}/questions/${question.number}`}
                  className="flex items-center justify-between gap-3 py-2.5 transition hover:opacity-80"
                >
                  <span className="text-sm font-semibold text-ink">
                    Q.{question.number}
                  </span>
                  <span className={clsx("text-sm font-bold", tone.text)}>
                    {percent}%
                  </span>
                  <span
                    className={clsx(
                      "w-32 text-right text-xs font-semibold",
                      tone.text
                    )}
                  >
                    {OBJECTION_LABEL[level]}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <Link
        href={`/exams/${examSlug}/objections${phaseSlug ? `?phase=${phaseSlug}` : ""}`}
        className="mt-4 block rounded-lg bg-brand-50 px-4 py-2.5 text-center text-sm font-semibold text-brand-700 transition hover:bg-brand-100"
      >
        View Full Tracker
      </Link>
    </section>
  );
}
