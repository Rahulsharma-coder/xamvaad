import clsx from "clsx";
import { Check, FileText, Flag, Gavel, Trophy } from "lucide-react";
import type { ExamStage, StageStatus } from "@/prisma/client";
import { dateRange, shortDate } from "@/lib/format";
import { stageHasEnd } from "@/lib/lifecycle";

/**
 * Exam Lifecycle Status — wireframe 04.
 *
 * This is the spine of the Objection Tracker: the objection window being
 * ACTIVE is what makes community voting actionable rather than academic.
 */

const STAGE_META: Record<
  ExamStage,
  { label: string; icon: typeof Check }
> = {
  CONDUCTED: { label: "Exam Window", icon: Check },
  ANSWER_KEY_RELEASED: { label: "Ans Key Released", icon: FileText },
  OBJECTION_WINDOW: { label: "Objection Window", icon: Gavel },
  FINAL_KEY: { label: "Final Key", icon: Flag },
  RESULT: { label: "Result", icon: Trophy },
};

type Stage = {
  id: string;
  stage: ExamStage;
  status: StageStatus;
  startsAt: Date | string | null;
  endsAt: Date | string | null;
  note?: string | null;
};

function stageDate(stage: Stage): string {
  // The exam and objection windows span days; the rest are single moments.
  if (stageHasEnd(stage.stage)) {
    return dateRange(stage.startsAt, stage.endsAt);
  }
  if (stage.startsAt) return shortDate(stage.startsAt);
  return "TBA";
}

export function LifecycleStepper({ stages }: { stages: Stage[] }) {
  return (
    <section
      aria-label="Exam lifecycle status"
      className="rounded-xl border border-hairline bg-surface p-4"
    >
      <h2 className="mb-4 text-sm font-semibold text-ink">
        Exam Lifecycle Status
      </h2>

      <ol className="no-scrollbar flex items-start gap-1 overflow-x-auto">
        {stages.map((stage, index) => {
          const meta = STAGE_META[stage.stage];
          const Icon = meta.icon;
          const isDone = stage.status === "DONE";
          const isActive = stage.status === "ACTIVE";

          return (
            <li
              key={stage.id}
              className="relative flex min-w-[5.5rem] flex-1 flex-col items-center text-center"
            >
              {/* Connector to the previous node. */}
              {index > 0 && (
                <span
                  aria-hidden="true"
                  className={clsx(
                    "absolute right-1/2 top-4 h-0.5 w-full",
                    isDone || isActive ? "bg-brand-500" : "bg-hairline"
                  )}
                />
              )}

              <span
                className={clsx(
                  "relative z-10 flex h-8 w-8 items-center justify-center rounded-full border-2",
                  isDone && "border-settled bg-settled text-white",
                  isActive && "border-brand-600 bg-brand-600 text-white",
                  !isDone &&
                    !isActive &&
                    "border-hairline bg-surface text-slate-400"
                )}
              >
                <Icon size={15} strokeWidth={2.6} />
              </span>

              <span
                className={clsx(
                  "mt-2 text-[11px] font-semibold leading-tight",
                  isActive ? "text-brand-700" : "text-ink"
                )}
              >
                {meta.label}
              </span>
              <span
                className={clsx(
                  "mt-0.5 text-[10px]",
                  isActive ? "font-semibold text-brand-600" : "text-ink-muted"
                )}
              >
                {stageDate(stage)}
              </span>
            </li>
          );
        })}
      </ol>

      {stages.find((s) => s.status === "ACTIVE")?.note && (
        <p className="mt-3 rounded-lg bg-brand-50 px-3 py-2 text-xs text-brand-800">
          {stages.find((s) => s.status === "ACTIVE")!.note}
        </p>
      )}
    </section>
  );
}
