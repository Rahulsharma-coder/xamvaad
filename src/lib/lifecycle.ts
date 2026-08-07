import type { ExamStage, StageStatus } from "@/prisma/client";

/**
 * Exam lifecycle status, derived from dates.
 *
 * Status used to be a stored column that somebody had to flip by hand. That
 * made the objection window a liability: it gates whether aspirants may file
 * Objection Questions, so a forgotten update either locked the window shut on
 * a live exam or left it open long after the official portal stopped
 * accepting challenges.
 *
 * Dates are now the source of truth and status is computed on read, which is
 * what makes the lifecycle meter update itself. `statusOverride` remains for
 * the cases that make this domain messy — authorities postpone, extend and
 * re-open windows constantly, and an admin needs to say so directly.
 */

export type StageDates = {
  stage: ExamStage;
  statusOverride: StageStatus | null;
  startsAt: Date | null;
  endsAt: Date | null;
};

/**
 * Stages that occupy a span of days rather than a single moment.
 *
 * An exam is not a one-day event. SSC CGL Tier 1 is sat across a week of
 * shifts and NTPC CBT 1 across several, so "Conducted" is a window in exactly
 * the way the objection window is: it opens on the first sitting and closes
 * after the last one. Treating it as a single date meant an exam counted as
 * finished on day one — while thousands of candidates still had their paper
 * ahead of them.
 */
export const RANGE_STAGES: ExamStage[] = ["CONDUCTED", "OBJECTION_WINDOW"];

export function stageHasEnd(stage: ExamStage): boolean {
  return RANGE_STAGES.includes(stage);
}

/**
 * The instant a stage's end date actually expires.
 *
 * End dates are stored at UTC midnight but they mean "through the end of that
 * day". Without this an exam window ending on the 14th would flip to DONE at
 * midnight *on* the 14th, before that day's shifts had been sat, and the
 * objection window would silently lose its final day the same way.
 *
 * The boundary is end of UTC day, which is 05:29 IST the following morning —
 * a few hours of over-run rather than a full day cut short. That is the safe
 * direction to err in: nobody is locked out of a window that is officially
 * still open.
 */
export function stageEndBoundary(endsAt: Date): Date {
  const end = new Date(endsAt);
  end.setUTCHours(23, 59, 59, 999);
  return end;
}

/**
 * A stage is DONE once its end (or its start, for single-moment stages) has
 * passed, ACTIVE while it is running, PENDING before it begins or while it has
 * no date at all.
 */
export function deriveStageStatus(
  stage: StageDates,
  now: Date = new Date()
): StageStatus {
  if (stage.statusOverride) return stage.statusOverride;

  const { startsAt, endsAt } = stage;

  // Undated stages are announced as "TBA" and are always still to come.
  if (!startsAt && !endsAt) return "PENDING";

  // A dated span — the exam window, the objection window. ACTIVE from the
  // first day through the last, inclusive.
  if (startsAt && endsAt) {
    if (now < startsAt) return "PENDING";
    if (now > stageEndBoundary(endsAt)) return "DONE";
    return "ACTIVE";
  }

  // A single-moment stage — "answer key released on the 18th". It is ACTIVE on
  // the day itself so the stepper has something lit, and DONE afterwards.
  const moment = (startsAt ?? endsAt)!;
  if (now < moment) return "PENDING";
  if (isSameUtcDay(now, moment)) return "ACTIVE";
  return "DONE";
}

function isSameUtcDay(a: Date, b: Date): boolean {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  );
}

/** Attaches the derived status to each stage, preserving order. */
export function withDerivedStatus<T extends StageDates>(
  stages: T[],
  now: Date = new Date()
): (T & { status: StageStatus })[] {
  return stages.map((stage) => ({
    ...stage,
    status: deriveStageStatus(stage, now),
  }));
}

/**
 * Whether objections can currently be raised for an exam.
 *
 * The single question the posting rules care about, kept here so the API, the
 * create form and the admin preview cannot disagree about it.
 */
export function isObjectionWindowOpen(
  stages: StageDates[],
  now: Date = new Date()
): boolean {
  const window = stages.find((s) => s.stage === "OBJECTION_WINDOW");
  if (!window) return false;
  return deriveStageStatus(window, now) === "ACTIVE";
}

/** The stage an exam is currently sitting in, for admin list rows. */
export function currentStage(
  stages: StageDates[],
  now: Date = new Date()
): ExamStage | null {
  const active = stages.find(
    (s) => deriveStageStatus(s, now) === "ACTIVE"
  );
  if (active) return active.stage;

  // Between stages: report the last completed one.
  const done = stages.filter((s) => deriveStageStatus(s, now) === "DONE");
  return done.length ? done[done.length - 1]!.stage : null;
}

export const STAGE_ORDER: ExamStage[] = [
  "CONDUCTED",
  "ANSWER_KEY_RELEASED",
  "OBJECTION_WINDOW",
  "FINAL_KEY",
  "RESULT",
];

export const STAGE_LABEL: Record<ExamStage, string> = {
  CONDUCTED: "Exam Window",
  ANSWER_KEY_RELEASED: "Answer Key Released",
  OBJECTION_WINDOW: "Objection Window",
  FINAL_KEY: "Final Key",
  RESULT: "Result",
};

/** Copy used in the notification each transition sends to aspirants. */
export const STAGE_ANNOUNCEMENT: Record<
  ExamStage,
  { start: string; end: string | null }
> = {
  // Both ends of the exam window are worth an alert, and for different
  // reasons: the first tells aspirants that memory questions and cutoff
  // estimates have just opened, the second that every shift is now in.
  CONDUCTED: {
    start: "has begun — you can now post memory questions and cutoff estimates",
    end: "is over — all shifts have now been conducted",
  },
  ANSWER_KEY_RELEASED: { start: "answer key has been released", end: null },
  OBJECTION_WINDOW: {
    start: "objection window is now open",
    end: "objection window has closed",
  },
  FINAL_KEY: { start: "final answer key is out", end: null },
  RESULT: { start: "result has been declared", end: null },
};
