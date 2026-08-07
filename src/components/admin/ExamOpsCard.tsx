import Link from "next/link";
import { CheckCircle2, Clock, Loader, Megaphone, PencilLine } from "lucide-react";
import type { ExamStage, PhaseKind, StageStatus } from "@/prisma/client";
import { BoardIcon } from "@/components/BoardIcon";
import { Badge } from "./ui";
import { deriveStageStatus } from "@/lib/lifecycle";
import { pickDefaultPhase } from "@/lib/phases";
import { dateRange, shortDate } from "@/lib/format";

type StageRow = {
  stage: ExamStage;
  statusOverride: StageStatus | null;
  startsAt: Date | null;
  endsAt: Date | null;
};

export type ExamOpsPhase = {
  id: string;
  slug: string;
  name: string;
  kind: PhaseKind;
  sequence: number;
  stages: StageRow[];
  sessions: { id: string }[];
};

export type ExamOpsExam = {
  id: string;
  slug: string;
  name: string;
  archivedAt?: Date | null;
  board: { name: string; color: string | null; icon: string | null };
  phases: ExamOpsPhase[];
  _count: { posts: number; questions: number };
};

/**
 * The exam card — one operational summary per exam.
 *
 * Four dates in a grid, the two status lines beneath, and the two actions an
 * admin actually takes from here. Every status is derived from the dates, so
 * the card cannot disagree with what aspirants see on the exam hub.
 */
export function ExamOpsCard({ exam }: { exam: ExamOpsExam }) {
  // An exam has several tiers, each with its own lifecycle. The card reports
  // the one that is actually happening — that is what needs a decision today.
  const phase = pickDefaultPhase(exam.phases);

  const byStage = (stage: ExamStage) =>
    phase?.stages.find((s) => s.stage === stage) ?? null;

  const conducted = byStage("CONDUCTED");
  const answerKey = byStage("ANSWER_KEY_RELEASED");
  const objection = byStage("OBJECTION_WINDOW");
  const result = byStage("RESULT");

  const status = (row: StageRow | null): StageStatus =>
    row ? deriveStageStatus(row) : "PENDING";

  const archived = Boolean(exam.archivedAt);
  const objectionOpen = status(objection) === "ACTIVE";
  const examUnderWay = status(conducted) === "ACTIVE";
  const resultDone = status(result) === "DONE";

  // The card's headline state, most urgent first.
  const headline = archived
    ? { tone: "neutral" as const, label: "Archived" }
    : objectionOpen
      ? { tone: "warn" as const, label: "Objections open" }
      : examUnderWay
        ? { tone: "warn" as const, label: "Exam under way" }
        : resultDone
          ? { tone: "done" as const, label: "Completed" }
          : { tone: "live" as const, label: "Live" };

  return (
    <article className="rounded-2xl border border-hairline bg-surface p-4">
      <div className="flex items-center gap-2.5">
        <BoardIcon icon={exam.board.icon} color={exam.board.color} size={28} />
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-bold text-ink">{exam.name}</h3>
          {phase && (
            <p className="truncate text-[11px] text-ink-muted">
              {phase.name}
              {exam.phases.length > 1 &&
                ` · ${exam.phases.length} phases`}
            </p>
          )}
        </div>
        <Badge tone={headline.tone}>{headline.label}</Badge>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 border-t border-hairline pt-3">
        <DateCell
          label="Exam window"
          value={
            conducted?.startsAt || conducted?.endsAt
              ? dateRange(conducted.startsAt, conducted.endsAt)
              : "TBA"
          }
          highlight={examUnderWay}
        />
        <DateCell
          label="Answer key"
          value={answerKey?.startsAt ? shortDate(answerKey.startsAt) : "TBA"}
        />
        <DateCell
          label="Objection window"
          value={
            objection?.startsAt || objection?.endsAt
              ? dateRange(objection.startsAt, objection.endsAt)
              : "TBA"
          }
          highlight={objectionOpen}
        />
        <DateCell
          label="Final result"
          value={result?.startsAt ? shortDate(result.startsAt) : "TBA"}
        />
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-hairline pt-3 text-xs">
        {/* Three states, not two: an exam sat across a week is neither
            "not yet held" nor "completed" while it is running. */}
        <StatusLine
          status={status(conducted)}
          text={{
            DONE: "All shifts conducted",
            ACTIVE: "Exam under way",
            PENDING: "Exam not yet held",
          }}
        />
        <StatusLine
          status={status(answerKey)}
          text={{
            DONE: "Answer key published",
            ACTIVE: "Answer key published",
            PENDING: "Awaiting answer key",
          }}
        />
      </div>

      <div className="mt-3 flex flex-wrap gap-2 border-t border-hairline pt-3">
        <Link
          href={`/admin/exams/${exam.slug}`}
          className="inline-flex items-center gap-1.5 rounded-lg border border-hairline px-3 py-2 text-xs font-semibold text-ink transition hover:bg-canvas"
        >
          <PencilLine size={14} />
          Edit lifecycle
        </Link>
        <Link
          href={`/admin/updates?exam=${exam.slug}`}
          className="inline-flex items-center gap-1.5 rounded-lg border border-hairline px-3 py-2 text-xs font-semibold text-ink transition hover:bg-canvas"
        >
          <Megaphone size={14} />
          Publish update
        </Link>

        <span className="ml-auto self-center text-[11px] text-ink-muted">
          {exam._count.posts} posts · {exam._count.questions} questions
        </span>
      </div>
    </article>
  );
}

function DateCell({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-lg border p-2.5 ${
        highlight ? "border-amber-300 bg-amber-50" : "border-hairline bg-canvas"
      }`}
    >
      <p className="text-[11px] text-ink-muted">{label}</p>
      <p className="mt-0.5 text-sm font-bold text-ink">{value}</p>
    </div>
  );
}

function StatusLine({
  status,
  text,
}: {
  status: StageStatus;
  text: Record<StageStatus, string>;
}) {
  const done = status === "DONE";
  const active = status === "ACTIVE";

  return (
    <span
      className={`inline-flex items-center gap-1.5 font-medium ${
        done ? "text-settled" : active ? "text-brand-700" : "text-amber-600"
      }`}
    >
      {done ? (
        <CheckCircle2 size={14} />
      ) : active ? (
        <Loader size={14} />
      ) : (
        <Clock size={14} />
      )}
      {text[status]}
    </span>
  );
}
