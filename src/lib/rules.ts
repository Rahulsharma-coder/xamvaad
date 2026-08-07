/**
 * Business rules — PRD Part 6, which the document left as bare bullets.
 * Everything policy-shaped lives here so the numbers are reviewable in one
 * place rather than scattered through route handlers and components.
 */

import type { PostType } from "../prisma/client";

// ---------------------------------------------------------------------------
// Objection Tracker thresholds
// ---------------------------------------------------------------------------
//
// Calibrated against the wireframes, which show 82% and 76% as "Strong
// Objection", 62% as "Under Review" and 18% as "Low Objection".

export const OBJECTION_STRONG = 70; // >= 70%  -> Strong Objection
export const OBJECTION_REVIEW = 40; // 40-69%  -> Under Review
// < 40% -> Low Objection

/** Minimum votes before a percentage is treated as meaningful. */
export const OBJECTION_MIN_VOTES = 20;

export type ObjectionLevel = "STRONG" | "REVIEW" | "LOW" | "INSUFFICIENT";

export function objectionPercent(objectVotes: number, correctVotes: number) {
  const total = objectVotes + correctVotes;
  if (total === 0) return 0;
  return Math.round((objectVotes / total) * 100);
}

export function objectionLevel(
  objectVotes: number,
  correctVotes: number
): ObjectionLevel {
  const total = objectVotes + correctVotes;
  if (total < OBJECTION_MIN_VOTES) return "INSUFFICIENT";
  const pct = objectionPercent(objectVotes, correctVotes);
  if (pct >= OBJECTION_STRONG) return "STRONG";
  if (pct >= OBJECTION_REVIEW) return "REVIEW";
  return "LOW";
}

export const OBJECTION_LABEL: Record<ObjectionLevel, string> = {
  STRONG: "Strong Objection",
  REVIEW: "Under Review",
  LOW: "Low Objection",
  INSUFFICIENT: "Needs more votes",
};

/**
 * The banner shown on the question detail screen. Only a STRONG level earns
 * the "Objection Recommended" call-out — this is the one piece of the product
 * that reads as advice, so it stays conservative.
 */
export function isObjectionRecommended(
  objectVotes: number,
  correctVotes: number
): boolean {
  return objectionLevel(objectVotes, correctVotes) === "STRONG";
}

// ---------------------------------------------------------------------------
// Question options
// ---------------------------------------------------------------------------

/**
 * Competitive exam papers are four-option MCQs, so the lettering is fixed
 * rather than author-defined. Keeping it a constant means the create form, the
 * API and the display all agree on the labels.
 */
export const OPTION_LABELS = ["A", "B", "C", "D"] as const;

export type OptionLabel = (typeof OPTION_LABELS)[number];

// ---------------------------------------------------------------------------
// Recall confidence (Memory Questions)
// ---------------------------------------------------------------------------

/**
 * How accurately the author claims to have reproduced the question's wording.
 *
 * The percentage is a readability aid, not a measurement — it turns four
 * abstract labels into something a reader can weigh at a glance. Wording is
 * deliberately about the *question*, never the answer: a candidate can recall
 * a question perfectly and have no idea what the answer is.
 */
export const RECALL_CONFIDENCE = {
  EXACT: {
    label: "Word-for-word",
    percent: 99,
    hint: "I'm certain of the wording",
  },
  NEAR_EXACT: {
    label: "Nearly exact",
    percent: 90,
    hint: "Wording may differ slightly",
  },
  PARTIAL: {
    label: "Key parts only",
    percent: 75,
    hint: "The numbers and the idea are right",
  },
  ROUGH: {
    label: "Rough recollection",
    percent: 60,
    hint: "I may have some details wrong",
  },
} as const;

export type RecallConfidenceKey = keyof typeof RECALL_CONFIDENCE;

export const RECALL_CONFIDENCE_KEYS = [
  "EXACT",
  "NEAR_EXACT",
  "PARTIAL",
  "ROUGH",
] as const;

// ---------------------------------------------------------------------------
// Expected Cutoff
// ---------------------------------------------------------------------------

export const EXAM_CATEGORIES = ["GENERAL", "EWS", "OBC", "SC", "ST"] as const;

export type ExamCategoryKey = (typeof EXAM_CATEGORIES)[number];

export const CATEGORY_LABEL: Record<ExamCategoryKey, string> = {
  GENERAL: "General",
  EWS: "EWS",
  OBC: "OBC",
  SC: "SC",
  ST: "ST",
};

export const CUTOFF_BASIS_KEYS = [
  "MULTI_SHIFT",
  "OWN_SHIFT",
  "COACHING",
  "GUESS",
] as const;

export type CutoffBasisKey = (typeof CUTOFF_BASIS_KEYS)[number];

/**
 * How the author reached their numbers. Shown as a plain label on the card so
 * a reader can weigh a coaching institute's figure differently from a guess.
 */
export const CUTOFF_BASIS: Record<
  CutoffBasisKey,
  { label: string; hint: string }
> = {
  MULTI_SHIFT: {
    label: "Multiple shifts analysed",
    hint: "Compared difficulty across several shifts",
  },
  OWN_SHIFT: {
    label: "My shift only",
    hint: "Based on the paper I sat",
  },
  COACHING: {
    label: "Coaching estimate",
    hint: "Published by a coaching institute",
  },
  GUESS: {
    label: "Rough guess",
    hint: "A hunch, not an analysis",
  },
};

/** Highest mark a cutoff prediction may take, guarding typos like 1480. */
export const CUTOFF_MAX_MARKS = 1000;

/**
 * Community consensus for one category.
 *
 * Median rather than mean on purpose: cutoff threads attract wishful and
 * despairing outliers, and one person typing 250 should not drag the headline
 * number. The range is reported alongside so the spread stays visible.
 */
export function summariseEstimates(marks: number[]): {
  median: number;
  min: number;
  max: number;
  count: number;
} | null {
  if (marks.length === 0) return null;

  const sorted = [...marks].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 === 0
      ? (sorted[mid - 1]! + sorted[mid]!) / 2
      : sorted[mid]!;

  return {
    median: Math.round(median * 100) / 100,
    min: sorted[0]!,
    max: sorted[sorted.length - 1]!,
    count: sorted.length,
  };
}

// ---------------------------------------------------------------------------
// Auto-generated hashtags (PRD: "Hashtags are generated automatically from
// metadata and are clickable")
// ---------------------------------------------------------------------------

export function normaliseTag(raw: string): string {
  return raw
    .trim()
    .replace(/^#/, "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toLowerCase();
}

/** e.g. 2024-07-25 -> "25July" */
export function dateTagLabel(date: Date): string {
  const day = date.getUTCDate();
  const month = date.toLocaleString("en-US", {
    month: "long",
    timeZone: "UTC",
  });
  return `${day}${month}`;
}

/**
 * Types whose content belongs to one specific sitting rather than to the exam
 * as a whole. Only these carry automatic date and shift tags, and only these
 * are filtered by shift in the Exam Hub.
 *
 * A Discussion like "how was the GK section?" spans every shift — stamping it
 * with one date and shift both mislabels it and hides it from everyone viewing
 * a different shift. Authors can still add a shift by hand as a manual tag.
 */
export function isShiftScoped(type: PostType): boolean {
  return (
    type === "MEMORY_QUESTION" ||
    type === "OBJECTION_QUESTION" ||
    type === "EXPECTED_CUTOFF"
  );
}

export function autoTagsFor(input: {
  type: PostType;
  boardName: string;
  examShortName: string;
  date?: Date | null;
  shift?: string | null;
}): string[] {
  const labels = [input.boardName, input.examShortName];

  if (isShiftScoped(input.type)) {
    if (input.date) labels.push(dateTagLabel(input.date));
    if (input.shift) labels.push(input.shift.replace(/\s+/g, ""));
  }

  // De-duplicate on the normalised form while keeping the display casing.
  const seen = new Set<string>();
  const out: string[] = [];
  for (const label of labels) {
    const key = normaliseTag(label);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(label);
  }
  return out;
}

export const MAX_MANUAL_TAGS = 5;

// ---------------------------------------------------------------------------
// Posting rules
// ---------------------------------------------------------------------------

export const TITLE_MIN = 10;
export const TITLE_MAX = 160;
export const BODY_MIN = 20;
export const BODY_MAX = 10_000;
export const COMMENT_MAX = 4_000;

/** Window during which an author may still edit their own post, in minutes. */
export const EDIT_WINDOW_MINUTES = 30;

export function withinEditWindow(createdAt: Date, now = new Date()): boolean {
  const elapsed = (now.getTime() - createdAt.getTime()) / 60_000;
  return elapsed <= EDIT_WINDOW_MINUTES;
}

/**
 * Duplicate detection (PRD Part 6). Cheap and deterministic: two posts collide
 * when they share board + exam + session + type and have near-identical
 * titles. Anything smarter (embeddings) is a V2 concern.
 */
export function titleFingerprint(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .sort()
    .join(" ");
}

/** Post types the create-post picker surfaces, in wireframe 12 order. */
export const POST_TYPE_OPTIONS: {
  value: PostType;
  title: string;
  hint: string;
  icon: string;
}[] = [
  {
    value: "DISCUSSION",
    title: "Discussion",
    hint: "Start a discussion",
    icon: "MessageCircle",
  },
  { value: "POLL", title: "Poll", hint: "Ask & poll", icon: "BarChart3" },
  {
    value: "MEMORY_QUESTION",
    title: "Memory Question",
    hint: "Share question",
    icon: "Brain",
  },
  {
    value: "OBJECTION_QUESTION",
    title: "Objection Question",
    hint: "Challenge an answer",
    icon: "Gavel",
  },
  {
    value: "OFFICIAL_UPDATE",
    title: "Official Update",
    hint: "Share official info",
    icon: "ShieldCheck",
  },
  {
    value: "EXPECTED_CUTOFF",
    title: "Expected Cutoff",
    hint: "Share your estimate",
    icon: "TrendingUp",
  },
];

export const POST_TYPE_LABEL: Record<PostType, string> = {
  DISCUSSION: "Discussion",
  POLL: "Poll",
  MEMORY_QUESTION: "Memory Question",
  EXPECTED_CUTOFF: "Expected Cutoff",
  OFFICIAL_UPDATE: "Official Update",
  OBJECTION_QUESTION: "Objection Question",
};

/**
 * Types that are posted as a question with four lettered choices rather than a
 * title and a body: Objection Questions (challenging a published key) and
 * Memory Questions (reconstructing a paper).
 */
export function isChoiceQuestion(type: PostType): boolean {
  return type === "OBJECTION_QUESTION" || type === "MEMORY_QUESTION";
}

/**
 * The objection meter belongs to exactly one post type. A Memory Question
 * records what was asked; it makes no claim that the answer is wrong, so
 * showing a "should this be challenged?" meter on it invites votes on a
 * question nobody disputed.
 */
export function showsObjectionMeter(type: PostType): boolean {
  return type === "OBJECTION_QUESTION";
}

/**
 * Types that must be attached to a numbered question in a specific shift —
 * without one there is nothing to object to or to index.
 */
export function requiresQuestionNumber(type: PostType): boolean {
  return type === "OBJECTION_QUESTION";
}

/**
 * Types that only make sense once the paper has actually been sat.
 *
 * You cannot recall a question from an exam you haven't taken, challenge an
 * answer key that doesn't exist, or estimate a cutoff for a paper nobody has
 * seen. Anything filed before the exam would be invention, and it would sit in
 * the permanent record next to genuine recollections.
 *
 * Discussions and Polls stay open throughout — "what's the expected pattern?"
 * is exactly the conversation an upcoming exam should have.
 */
export function requiresConductedPhase(type: PostType): boolean {
  return (
    type === "MEMORY_QUESTION" ||
    type === "OBJECTION_QUESTION" ||
    type === "EXPECTED_CUTOFF"
  );
}

/**
 * Objection Questions may only be raised while the exam's objection window is
 * open. Outside it the official portal will not accept a challenge, so
 * collecting votes would imply an action the aspirant cannot take.
 */
export function requiresOpenObjectionWindow(type: PostType): boolean {
  return type === "OBJECTION_QUESTION";
}

/**
 * Only staff may publish Official Updates — the wireframe shows them with an
 * authority badge, so an ordinary user must not be able to forge one.
 */
export function canPostType(type: PostType, isStaffUser: boolean): boolean {
  if (type === "OFFICIAL_UPDATE") return isStaffUser;
  return true;
}

// ---------------------------------------------------------------------------
// Rate limiting (spam rule)
// ---------------------------------------------------------------------------

export const MAX_POSTS_PER_HOUR = 10;
export const MAX_COMMENTS_PER_HOUR = 60;
