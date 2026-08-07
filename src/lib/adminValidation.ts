import { z } from "zod";
import { OPTION_LABELS } from "./rules";

/** Schemas for the admin API. Kept apart so the public rules stay readable. */

export const STAGE_KEYS = [
  "CONDUCTED",
  "ANSWER_KEY_RELEASED",
  "OBJECTION_WINDOW",
  "FINAL_KEY",
  "RESULT",
] as const;

/**
 * Date inputs submit "YYYY-MM-DD". Parsed at UTC midnight so a stage boundary
 * never drifts by a day depending on the admin's timezone — the same reason
 * exam dates are stored as UTC dates elsewhere.
 */
const dayString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid date")
  .nullable()
  .optional();

export const updateStagesSchema = z
  .object({
    /** The tier whose lifecycle is being set. */
    phaseId: z.string().min(1, "Choose a phase"),
    stages: z
      .array(
        z.object({
          stage: z.enum(STAGE_KEYS),
          startsAt: dayString,
          endsAt: dayString,
          note: z.string().trim().max(300).nullable().optional(),
          statusOverride: z
            .enum(["DONE", "ACTIVE", "PENDING"])
            .nullable()
            .optional(),
        })
      )
      .max(STAGE_KEYS.length),
    /**
     * Set when backfilling an old exam: marks past transitions as already
     * announced so aspirants aren't alerted about a window that closed weeks
     * ago.
     */
    suppressAnnouncements: z.boolean().optional(),
  })
  .refine(
    (data) =>
      data.stages.every(
        (s) =>
          !s.startsAt ||
          !s.endsAt ||
          new Date(s.endsAt) >= new Date(s.startsAt)
      ),
    { message: "A stage cannot end before it starts", path: ["stages"] }
  );

export const boardSchema = z.object({
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9-]+$/, "Use lowercase letters, numbers and hyphens")
    .min(2)
    .max(40),
  name: z.string().trim().min(1).max(40),
  fullName: z.string().trim().min(1).max(120),
  description: z.string().trim().max(300).optional().nullable(),
  icon: z.string().trim().max(40).optional().nullable(),
  color: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, "Use a hex colour like #DC2626")
    .optional()
    .nullable(),
  sortOrder: z.number().int().min(0).max(999).optional(),
  isActive: z.boolean().optional(),
});

export const examSchema = z.object({
  boardId: z.string().min(1, "Choose a board"),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9-]+$/, "Use lowercase letters, numbers and hyphens")
    .min(3)
    .max(60),
  name: z.string().trim().min(3).max(120),
  shortName: z.string().trim().min(1).max(20),
  year: z.number().int().min(2000).max(2100),
  description: z.string().trim().max(300).optional().nullable(),
  isActive: z.boolean().optional(),
});

/** A tier of an exam: Tier 1, CBT 2, Prelims, Interview. */
export const phaseSchema = z.object({
  examId: z.string().min(1, "Choose an exam"),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9-]+$/, "Use lowercase letters, numbers and hyphens")
    .min(2)
    .max(40),
  name: z.string().trim().min(1).max(60),
  shortName: z.string().trim().min(1).max(20),
  kind: z.enum([
    "WRITTEN",
    "SKILL_TEST",
    "PHYSICAL",
    "INTERVIEW",
    "DOCUMENT_VERIFICATION",
  ]),
  sequence: z.number().int().min(1).max(20),
  description: z.string().trim().max(300).optional().nullable(),
});

/** Bulk shift creation from the official notification. */
export const sessionsSchema = z.object({
  /** Which tier these sittings belong to. */
  phaseId: z.string().min(1, "Choose a phase"),
  sessions: z
    .array(
      z.object({
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid date"),
        shift: z.string().trim().min(1).max(40),
      })
    )
    .min(1)
    .max(100),
});

export const answerKeySchema = z.object({
  sessionId: z.string().min(1),
  /** Which key is being entered: provisional resolves nothing, final closes voting. */
  keyType: z.enum(["PROVISIONAL", "FINAL"]),
  answers: z
    .array(
      z.object({
        number: z.number().int().positive().max(500),
        answer: z.enum(OPTION_LABELS),
      })
    )
    .min(1)
    .max(500),
});

export const moderateReportSchema = z.object({
  action: z.enum(["HIDE", "REMOVE", "DISMISS", "RESTORE"]),
  reason: z.string().trim().max(300).optional(),
});

export const banUserSchema = z.object({
  /** Null days means permanent. */
  days: z.number().int().min(1).max(3650).nullable(),
  reason: z.string().trim().min(3, "Give a reason").max(300),
  /** Whether to also hide everything they've posted. */
  hideContent: z.boolean().optional(),
});

export const officialUpdateSchema = z.object({
  examId: z.string().min(1, "Choose an exam"),
  title: z.string().trim().min(10).max(160),
  body: z.string().trim().min(20).max(10_000),
  notify: z.boolean().optional(),
});

/** Parses a "YYYY-MM-DD" input into a UTC-midnight Date. */
export function parseDay(value: string | null | undefined): Date | null {
  if (!value) return null;
  return new Date(`${value}T00:00:00.000Z`);
}

/** Formats a stored Date back into the "YYYY-MM-DD" a date input expects. */
export function toDayInput(value: Date | null | undefined): string {
  if (!value) return "";
  return value.toISOString().slice(0, 10);
}
