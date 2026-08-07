import { z } from "zod";
import {
  BODY_MAX,
  BODY_MIN,
  COMMENT_MAX,
  CUTOFF_BASIS_KEYS,
  CUTOFF_MAX_MARKS,
  EXAM_CATEGORIES,
  MAX_MANUAL_TAGS,
  OPTION_LABELS,
  RECALL_CONFIDENCE_KEYS,
  TITLE_MAX,
  TITLE_MIN,
} from "./rules";

export const postTypeSchema = z.enum([
  "DISCUSSION",
  "POLL",
  "MEMORY_QUESTION",
  "EXPECTED_CUTOFF",
  "OFFICIAL_UPDATE",
  "OBJECTION_QUESTION",
]);

export const registerSchema = z.object({
  name: z.string().trim().min(2, "Name is too short").max(60),
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(200),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  password: z.string().min(1, "Enter your password"),
});

export const updateProfileSchema = z.object({
  name: z.string().trim().min(2, "Name is too short").max(60).optional(),
  bio: z
    .string()
    .trim()
    .max(200, "Bio must be 200 characters or fewer")
    // An empty string clears the bio; Prisma stores it as null.
    .optional(),
});

/**
 * Sets or changes the password.
 *
 * `currentPassword` is required only when the account already has one. A
 * Google-only account has no password to prove, and the caller is already
 * authenticated by their session cookie — so requiring one would make it
 * impossible for them to ever add a password.
 */
export const setPasswordSchema = z.object({
  currentPassword: z.string().optional(),
  newPassword: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(200),
});

export const createPostSchema = z
  .object({
    boardId: z.string().min(1, "Choose a board"),
    examId: z.string().min(1, "Choose an exam"),
    /** Which tier — inferred from the shift when one is given. */
    phaseId: z.string().optional().nullable(),
    sessionId: z.string().optional().nullable(),
    type: postTypeSchema,
    title: z.string().trim().min(TITLE_MIN, "Title is too short").max(TITLE_MAX),
    // Length is enforced per type below: a Memory Question is carried by its
    // question and options, so an extra note is optional there.
    body: z.string().trim().max(BODY_MAX),
    tags: z.array(z.string().trim().min(1).max(30)).max(MAX_MANUAL_TAGS).optional(),
    questionNumber: z.number().int().positive().max(500).optional().nullable(),
    // Poll payload — required when type === "POLL".
    pollOptions: z
      .array(z.object({ label: z.string().trim().min(1).max(120) }))
      .min(2, "A poll needs at least two options")
      .max(6)
      .optional(),
    // Objection Question payload: the four lettered choices as they appeared
    // in the paper, plus the answer the official key gives.
    questionOptions: z
      .array(z.string().trim().min(1, "Fill in every option").max(300))
      .length(4, "Enter all four options")
      .optional(),
    officialAnswer: z.enum(OPTION_LABELS).optional(),
    subject: z.string().trim().max(40).optional(),
    // Memory Question: how well the author recalls the wording.
    recallConfidence: z.enum(RECALL_CONFIDENCE_KEYS).optional(),
    // Expected Cutoff: predicted marks per category, plus how they were reached.
    cutoffPredictions: z
      .array(
        z.object({
          category: z.enum(EXAM_CATEGORIES),
          marks: z.number().min(0).max(CUTOFF_MAX_MARKS),
        })
      )
      .max(EXAM_CATEGORIES.length)
      .optional(),
    cutoffBasis: z.enum(CUTOFF_BASIS_KEYS).optional(),
  })
  .refine(
    (data) => data.type !== "POLL" || (data.pollOptions?.length ?? 0) >= 2,
    { message: "A poll needs at least two options", path: ["pollOptions"] }
  )
  .refine(
    (data) =>
      data.type !== "OBJECTION_QUESTION" ||
      data.questionOptions?.length === 4,
    { message: "Enter all four options", path: ["questionOptions"] }
  )
  .refine(
    (data) => data.type !== "OBJECTION_QUESTION" || Boolean(data.officialAnswer),
    {
      message: "Select the answer given in the official key",
      path: ["officialAnswer"],
    }
  )
  .refine(
    (data) =>
      data.type !== "MEMORY_QUESTION" || data.questionOptions?.length === 4,
    { message: "Enter all four options", path: ["questionOptions"] }
  )
  .refine(
    (data) =>
      data.type !== "MEMORY_QUESTION" || Boolean(data.recallConfidence),
    {
      message: "Say how well you recall the wording",
      path: ["recallConfidence"],
    }
  )
  .refine(
    // An Expected Cutoff must at least predict the General cutoff — it is the
    // number every other category is read against.
    (data) =>
      data.type !== "EXPECTED_CUTOFF" ||
      Boolean(
        data.cutoffPredictions?.some((p) => p.category === "GENERAL")
      ),
    {
      message: "Enter at least the General cutoff",
      path: ["cutoffPredictions"],
    }
  )
  .refine(
    (data) => data.type !== "EXPECTED_CUTOFF" || Boolean(data.cutoffBasis),
    { message: "Say how you arrived at these numbers", path: ["cutoffBasis"] }
  )
  .refine(
    // Memory Questions and Expected Cutoffs are carried by their structured
    // data; every other type still needs a real description.
    (data) =>
      data.type === "MEMORY_QUESTION" ||
      data.type === "EXPECTED_CUTOFF" ||
      data.body.length >= BODY_MIN,
    { message: "Add a bit more detail", path: ["body"] }
  );

export const cutoffEstimateSchema = z.object({
  category: z.enum(EXAM_CATEGORIES),
  marks: z.number().min(0).max(CUTOFF_MAX_MARKS),
});

export const markAnswerSchema = z.object({
  optionId: z.string().min(1),
});

export const updatePostSchema = z.object({
  title: z.string().trim().min(TITLE_MIN).max(TITLE_MAX).optional(),
  body: z.string().trim().min(BODY_MIN).max(BODY_MAX).optional(),
});

export const createCommentSchema = z.object({
  body: z.string().trim().min(1, "Write something first").max(COMMENT_MAX),
  parentId: z.string().optional().nullable(),
});

export const pollVoteSchema = z.object({
  optionId: z.string().min(1),
});

export const objectionVoteSchema = z.object({
  stance: z.enum(["OBJECT", "CORRECT"]),
});

export const reportSchema = z.object({
  postId: z.string().optional().nullable(),
  commentId: z.string().optional().nullable(),
  reason: z.enum([
    "SPAM",
    "DUPLICATE",
    "MISINFORMATION",
    "ABUSE",
    "OFF_TOPIC",
    "OTHER",
  ]),
  details: z.string().trim().max(1000).optional(),
});
