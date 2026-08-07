import type { PhaseKind, StageStatus, ExamStage } from "@/prisma/client";
import { deriveStageStatus, type StageDates } from "./lifecycle";

/**
 * Phase helpers.
 *
 * A *phase* is a tier of the exam (Tier 1, CBT 2, Prelims, Interview); a
 * *stage* is a step inside one phase's lifecycle (conducted, answer key,
 * objection window). Keeping the two words distinct matters — they were both
 * called "stage" at one point and it was genuinely confusing.
 */

export const PHASE_KIND_LABEL: Record<PhaseKind, string> = {
  WRITTEN: "Written test",
  SKILL_TEST: "Skill test",
  PHYSICAL: "Physical test",
  INTERVIEW: "Interview",
  DOCUMENT_VERIFICATION: "Document verification",
};

/**
 * Only a written paper has an answer key, and therefore questions to remember,
 * challenge or poll about. A Physical Efficiency Test has nothing to object
 * to, so those tabs are hidden rather than shown empty.
 */
export function phaseHasAnswerKey(kind: PhaseKind): boolean {
  return kind === "WRITTEN";
}

/** Skill tests are sat in shifts; interviews and DV are scheduled per person. */
export function phaseHasShifts(kind: PhaseKind): boolean {
  return kind === "WRITTEN" || kind === "SKILL_TEST";
}

export type PhaseLike = {
  id: string;
  slug: string;
  kind: PhaseKind;
  sequence: number;
  stages: StageDates[];
  sessions: { id: string }[];
};

/**
 * The phase to show when none is named in the URL.
 *
 * Whichever one is actually happening, because that is what people are here to
 * discuss. Falling back to the most recent phase that has been conducted keeps
 * an exam between tiers pointing at the one people still have questions about,
 * rather than at an empty future tier.
 */
export function pickDefaultPhase<T extends PhaseLike>(
  phases: T[],
  now: Date = new Date()
): T | null {
  if (phases.length === 0) return null;

  const ordered = [...phases].sort((a, b) => a.sequence - b.sequence);

  const live = ordered.find((phase) =>
    phase.stages.some((stage) => deriveStageStatus(stage, now) === "ACTIVE")
  );
  if (live) return live;

  // Last phase with any completed stage — i.e. the furthest one that has begun.
  const started = ordered.filter((phase) =>
    phase.stages.some((stage) => deriveStageStatus(stage, now) === "DONE")
  );
  if (started.length) return started[started.length - 1]!;

  return ordered[0]!;
}

/** Short status word for a phase, used on the phase picker chips. */
export function phaseStatus(
  phase: { stages: StageDates[] },
  now: Date = new Date()
): { label: string; tone: "live" | "done" | "upcoming" } {
  const statuses = phase.stages.map((stage) => deriveStageStatus(stage, now));

  if (statuses.includes("ACTIVE")) return { label: "Live", tone: "live" };

  const result = phase.stages.find((s) => s.stage === "RESULT");
  if (result && deriveStageStatus(result, now) === "DONE") {
    return { label: "Completed", tone: "done" };
  }

  if (statuses.includes("DONE")) return { label: "In progress", tone: "live" };
  return { label: "Upcoming", tone: "upcoming" };
}

/** Whether objections can be filed against this phase right now. */
export function phaseObjectionOpen(
  phase: { kind: PhaseKind; stages: StageDates[] },
  now: Date = new Date()
): boolean {
  if (!phaseHasAnswerKey(phase.kind)) return false;
  const window = phase.stages.find(
    (stage) => stage.stage === ("OBJECTION_WINDOW" as ExamStage)
  );
  return window ? deriveStageStatus(window, now) === "ACTIVE" : false;
}

export type { StageStatus };
