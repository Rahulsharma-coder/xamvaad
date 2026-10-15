import type { ExamStage, StageStatus } from "@/prisma/client";
import { db } from "./db";
import { audit } from "./audit";
import { runDueAnnouncements } from "./announce";
import { STAGE_LABEL, stageHasEnd, stageLabel, stagesFor } from "./lifecycle";
import type { SessionUser } from "./auth";

/**
 * One change to one lifecycle stage, outside the admin panel's editor — the
 * Telegram bot's path in. It keeps the panel's rules: dates are the source of
 * truth, anything that has come due is announced at once, and the change is
 * audited under the admin who made it.
 */

export type StageChange =
  | { kind: "dates"; startsAt: Date; endsAt: Date | null }
  | { kind: "override"; status: StageStatus | null }
  | { kind: "tba" };

/** The IST calendar day of an instant, at UTC midnight like every stage date. */
export function istDay(at: Date = new Date()): Date {
  const day = at.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  return new Date(`${day}T00:00:00.000Z`);
}

export async function applyStageChange(input: {
  phaseId: string;
  stage: ExamStage;
  change: StageChange;
  actor: SessionUser;
  via: string;
}): Promise<{ summary: string; notified: number }> {
  const { phaseId, stage, change } = input;

  const phase = await db.examPhase.findUnique({
    where: { id: phaseId },
    select: {
      id: true,
      name: true,
      kind: true,
      exam: { select: { id: true, name: true, archivedAt: true } },
    },
  });
  if (!phase) throw new Error("That phase no longer exists.");
  if (phase.exam.archivedAt) {
    throw new Error(`${phase.exam.name} is archived. Restore it before editing.`);
  }
  if (!stagesFor(phase.kind).includes(stage)) {
    throw new Error(`${phase.name} has no ${STAGE_LABEL[stage]} stage.`);
  }

  if (change.kind === "dates") {
    if (change.endsAt && !stageHasEnd(stage)) {
      throw new Error(`${STAGE_LABEL[stage]} happens on one day, so it takes a single date.`);
    }
    if (change.endsAt && change.endsAt < change.startsAt) {
      throw new Error(`${STAGE_LABEL[stage]} ends before it starts.`);
    }
  }

  // Setting dates clears an override: the admin is saying when it happens,
  // and an override left behind would keep the stepper from showing it.
  const data =
    change.kind === "dates"
      ? { startsAt: change.startsAt, endsAt: change.endsAt, statusOverride: null }
      : change.kind === "override"
        ? { statusOverride: change.status }
        : { startsAt: null, endsAt: null, statusOverride: null };

  await db.examStageEntry.upsert({
    where: { phaseId_stage: { phaseId, stage } },
    create: { phaseId, stage, sortOrder: stagesFor(phase.kind).indexOf(stage) + 1, ...data },
    update: data,
  });

  const announced = await runDueAnnouncements(phase.exam.id);

  const what =
    change.kind === "dates"
      ? `set ${stageLabel(stage, phase)} to ${formatStageDates(change.startsAt, change.endsAt)}`
      : change.kind === "override"
        ? change.status
          ? `pinned ${STAGE_LABEL[stage]} as ${change.status.toLowerCase()}`
          : `returned ${STAGE_LABEL[stage]} to following its dates`
        : `cleared ${STAGE_LABEL[stage]} to TBA`;
  const summary = `${phase.exam.name} ${phase.name}: ${what}`;

  await audit({
    actor: input.actor,
    action: "exam.stage.update",
    targetType: "Exam",
    targetId: phase.exam.id,
    summary: `${summary} (${input.via})`,
    metadata: { phaseId, stage, change },
  });

  return { summary, notified: announced.sent };
}

/** "15 Oct", or "4–10 Oct" / "28 Sep – 3 Oct" for a span. */
export function formatStageDates(startsAt: Date | null, endsAt: Date | null): string {
  const fmt = (d: Date, month = true) =>
    d.toLocaleDateString("en-IN", {
      day: "numeric",
      ...(month ? { month: "short" } : {}),
      timeZone: "UTC",
    });
  if (!startsAt && !endsAt) return "TBA";
  if (!startsAt || !endsAt) return fmt((startsAt ?? endsAt)!);
  if (startsAt.getTime() === endsAt.getTime()) return fmt(startsAt);
  const sameMonth = startsAt.getUTCMonth() === endsAt.getUTCMonth();
  return `${fmt(startsAt, !sameMonth)}–${fmt(endsAt)}`;
}

// ---------------------------------------------------------------------------
// Reading dates typed by an admin
// ---------------------------------------------------------------------------

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

function monthIndex(word: string): number | null {
  const i = MONTHS.indexOf(word.slice(0, 3).toLowerCase());
  return i === -1 ? null : i;
}

function makeDay(year: number, month: number, day: number): Date | null {
  const d = new Date(Date.UTC(year, month, day));
  return d.getUTCMonth() === month && d.getUTCDate() === day ? d : null;
}

/** One day: "15 Oct", "15 October 2026", "15/10", "15/10/2026", "2026-10-15", "aaj". */
function parseOneDay(text: string, year: number, fallbackMonth?: number): Date | null {
  const t = text.trim().toLowerCase();
  if (t === "aaj" || t === "today") return istDay();

  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return makeDay(+m[1]!, +m[2]! - 1, +m[3]!);

  m = t.match(/^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2}|\d{4}))?$/);
  if (m) {
    const y = m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : year;
    return makeDay(y, +m[2]! - 1, +m[1]!);
  }

  m = t.match(/^(\d{1,2})(?:\s*([a-z]+))?(?:\s*,?\s*(\d{4}))?$/);
  if (m) {
    const month = m[2] ? monthIndex(m[2]) : (fallbackMonth ?? null);
    if (month === null) return null;
    return makeDay(m[3] ? +m[3] : year, month, +m[1]!);
  }
  return null;
}

/**
 * Reads what an admin typed: one day, or a span — "4-10 Oct",
 * "28 Sep - 3 Oct", "4 Oct to 10 Oct 2026". Without a year, the current one.
 */
export function parseStageDates(
  text: string
): { startsAt: Date; endsAt: Date | null } | null {
  const year = istDay().getUTCFullYear();
  const t = text.trim().toLowerCase().replace(/\s+/g, " ");

  const single = parseOneDay(t, year);
  if (single) return { startsAt: single, endsAt: null };

  // "4-10 oct" — a span inside one month, written without spaces.
  let m = t.match(/^(\d{1,2})\s*[-–]\s*(\d{1,2})\s*([a-z]+)(?:\s*,?\s*(\d{4}))?$/);
  if (m) {
    const month = monthIndex(m[3]!);
    const y = m[4] ? +m[4] : year;
    if (month === null) return null;
    const start = makeDay(y, month, +m[1]!);
    const end = makeDay(y, month, +m[2]!);
    return start && end ? { startsAt: start, endsAt: end } : null;
  }

  // "28 sep - 3 oct", "4 oct to 10 oct 2026"
  m = t.match(/^(.+?)\s*(?:\sto\s|–|\s-\s)\s*(.+)$/);
  if (m) {
    const endYear = m[2]!.match(/\d{4}$/)?.[0];
    const y = endYear ? +endYear : year;
    const end = parseOneDay(m[2]!, y);
    if (!end) return null;
    const start = parseOneDay(m[1]!, y, end.getUTCMonth());
    return start ? { startsAt: start, endsAt: end } : null;
  }

  return null;
}
