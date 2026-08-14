import type { PostType } from "@/prisma/client";
import { db } from "@/lib/db";
import { ApiError, handler, ok, pagination } from "@/lib/api";
import { getCurrentUser, isStaff, requireUser } from "@/lib/auth";
import { getFeed } from "@/lib/queries";
import { createPostSchema } from "@/lib/validation";
import { deriveStageStatus } from "@/lib/lifecycle";
import { allUsers, notifyMany } from "@/lib/announce";
import {
  MAX_POSTS_PER_HOUR,
  OPTION_LABELS,
  autoTagsFor,
  canPostType,
  isShiftScoped,
  normaliseTag,
  requiresConductedPhase,
  requiresOpenObjectionWindow,
  requiresQuestionNumber,
  titleFingerprint,
} from "@/lib/rules";

/** GET /api/posts — the board/exam feed with filters (PRD Part 2). */
export const GET = handler(async (req: Request) => {
  const url = new URL(req.url);
  const { skip, limit, page } = pagination(url);

  const result = await getFeed(
    {
      boardSlug: url.searchParams.get("board") ?? undefined,
      examSlug: url.searchParams.get("exam") ?? undefined,
      phaseId: url.searchParams.get("phaseId") ?? undefined,
      sessionId: url.searchParams.get("sessionId") ?? undefined,
      date: url.searchParams.get("date") ?? undefined,
      shift: url.searchParams.get("shift") ?? undefined,
      type: (url.searchParams.get("type") as PostType | null) ?? undefined,
      tag: url.searchParams.get("tag") ?? undefined,
      sort: url.searchParams.get("sort") === "top" ? "top" : "latest",
    },
    { skip, take: limit }
  );

  return ok({ ...result, page, limit });
});

/** POST /api/posts — create a structured post. */
export const POST = handler(async (req: Request) => {
  const user = await requireUser();
  const input = createPostSchema.parse(await req.json());

  if (!canPostType(input.type, isStaff(user))) {
    throw new ApiError(
      403,
      "Only moderators and admins can publish an Official Update."
    );
  }

  // Spam rule.
  const recentPosts = await db.post.count({
    where: {
      authorId: user.id,
      createdAt: { gte: new Date(Date.now() - 60 * 60 * 1000) },
    },
  });
  if (recentPosts >= MAX_POSTS_PER_HOUR) {
    throw new ApiError(
      429,
      "You've hit the hourly posting limit. Try again in a little while."
    );
  }

  const [board, exam] = await Promise.all([
    db.board.findUnique({
      where: { id: input.boardId },
      select: { id: true, name: true },
    }),
    db.exam.findUnique({
      where: { id: input.examId },
      // name is only needed for the Official Update notification, which reads
      // "SSC CGL 2026: ..." — shortName alone is too terse out of context.
      select: { id: true, name: true, shortName: true, boardId: true },
    }),
  ]);

  if (!board) throw new ApiError(404, "That board no longer exists.");
  if (!exam) throw new ApiError(404, "That exam no longer exists.");
  if (exam.boardId !== board.id) {
    throw new ApiError(400, "That exam does not belong to the selected board.");
  }

  // Only shift-scoped types are attached to a sitting. Attaching a Discussion
  // to one shift would hide it from every other shift's view of the Exam Hub,
  // so the shift is dropped rather than trusted from the client.
  let session = null;
  if (input.sessionId && isShiftScoped(input.type)) {
    session = await db.examSession.findUnique({
      where: { id: input.sessionId },
      select: { id: true, examId: true, phaseId: true, date: true, shift: true },
    });
    if (!session || session.examId !== exam.id) {
      throw new ApiError(400, "That shift does not belong to the selected exam.");
    }
  }

  // Which tier is this about? A shift settles it; otherwise the author picks,
  // since "how was the paper?" means something different for Tier 1 and Tier 2.
  let phase = null;
  const wantedPhaseId = session?.phaseId ?? input.phaseId ?? null;
  if (wantedPhaseId) {
    phase = await db.examPhase.findFirst({
      where: { id: wantedPhaseId, examId: exam.id },
      select: { id: true, name: true, kind: true, shortName: true },
    });
    if (!phase) {
      throw new ApiError(400, "That phase does not belong to the selected exam.");
    }
  }

  // Duplicate rule: same board + exam + session + type with an equivalent
  // title, posted by anyone in the last 24 hours.
  const fingerprint = titleFingerprint(input.title);
  const candidates = await db.post.findMany({
    where: {
      boardId: board.id,
      examId: exam.id,
      sessionId: session?.id ?? null,
      type: input.type,
      status: "ACTIVE",
      deletedAt: null,
      createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    },
    select: { id: true, title: true },
    take: 100,
  });
  const duplicate = candidates.find(
    (c) => titleFingerprint(c.title) === fingerprint
  );
  if (duplicate) {
    throw new ApiError(
      409,
      "A near-identical post already exists for this exam and shift."
    );
  }

  // Tags: auto from metadata, plus the author's optional manual ones.
  // Date and shift are only stamped on shift-scoped types — see isShiftScoped.
  const autoLabels = autoTagsFor({
    type: input.type,
    boardName: board.name,
    examShortName: exam.shortName,
    date: session?.date ?? null,
    shift: session?.shift ?? null,
  });
  const manualLabels = (input.tags ?? [])
    .map((t) => t.trim().replace(/^#/, ""))
    .filter(Boolean);

  const tagIds: string[] = [];
  const seen = new Set<string>();

  for (const [labels, kind] of [
    [autoLabels, "AUTO"] as const,
    [manualLabels, "MANUAL"] as const,
  ]) {
    for (const label of labels) {
      const name = normaliseTag(label);
      if (!name || seen.has(name)) continue;
      seen.add(name);
      const tag = await db.tag.upsert({
        where: { name },
        create: { name, label, kind },
        update: {},
        select: { id: true },
      });
      tagIds.push(tag.id);
    }
  }

  // An Objection Question challenges a specific answer, so it needs a shift, a
  // question number, and an open objection window.
  if (requiresQuestionNumber(input.type)) {
    if (!session) {
      throw new ApiError(
        400,
        "Choose the exam date and shift the question appeared in."
      );
    }
    if (!input.questionNumber) {
      throw new ApiError(400, "Enter the question number you're challenging.");
    }
  }

  // An exam that hasn't started yet has no paper to recall, no key to
  // challenge and no cutoff to estimate. Only Discussions and Polls are open
  // before it begins.
  //
  // The gate opens on the *first* day of the exam window, not the last: the
  // people who sat the first shift have a paper to remember and a cutoff to
  // argue about while the rest of the shifts are still to come.
  if (requiresConductedPhase(input.type)) {
    if (!phase) {
      throw new ApiError(400, "Choose which phase this is about.");
    }

    const conducted = await db.examStageEntry.findUnique({
      where: { phaseId_stage: { phaseId: phase.id, stage: "CONDUCTED" } },
      select: {
        stage: true,
        statusOverride: true,
        startsAt: true,
        endsAt: true,
      },
    });

    if (!conducted || deriveStageStatus(conducted) === "PENDING") {
      const opens = conducted?.startsAt
        ? ` It starts on ${conducted.startsAt.toLocaleDateString("en-IN", {
            day: "numeric",
            month: "long",
            timeZone: "UTC",
          })}.`
        : "";

      throw new ApiError(
        409,
        `${phase.name} hasn't started yet, so there's nothing to recall, challenge or estimate.${opens} You can still start a Discussion or a Poll about it.`
      );
    }
  }

  if (requiresOpenObjectionWindow(input.type)) {
    if (!phase) {
      throw new ApiError(400, "Choose which phase you're objecting to.");
    }
    if (phase.kind !== "WRITTEN") {
      throw new ApiError(
        400,
        `${phase.name} is not a written test, so there is no answer key to challenge.`
      );
    }

    // The window belongs to the phase: Tier 1's closes long before Tier 2's
    // opens, so an exam-wide check would let one reopen the other.
    const window = await db.examStageEntry.findUnique({
      where: {
        phaseId_stage: { phaseId: phase.id, stage: "OBJECTION_WINDOW" },
      },
      select: {
        stage: true,
        statusOverride: true,
        startsAt: true,
        endsAt: true,
      },
    });

    // Derived from the dates, so the window opens and closes on schedule
    // without anyone flipping a flag.
    if (!window || deriveStageStatus(window) !== "ACTIVE") {
      throw new ApiError(
        409,
        "The objection window for this exam isn't open. You can still start a Discussion about the question."
      );
    }
  }

  // Link question-shaped posts to their tracked Question row when the author
  // gave a question number and we have a shift to hang it off.
  let questionId: string | null = null;
  if (
    input.questionNumber &&
    session &&
    (input.type === "MEMORY_QUESTION" || input.type === "OBJECTION_QUESTION")
  ) {
    const isObjection = input.type === "OBJECTION_QUESTION";

    const question = await db.question.upsert({
      where: {
        sessionId_number: { sessionId: session.id, number: input.questionNumber },
      },
      create: {
        examId: exam.id,
        phaseId: session.phaseId,
        sessionId: session.id,
        number: input.questionNumber,
        // Both choice-question forms carry the paper's wording and subject;
        // only an Objection Question asserts what the official key says.
        text: input.title,
        subject: input.subject || null,
        ...(isObjection ? { officialAnswer: input.officialAnswer ?? null } : {}),
      },
      // Never overwrite an answer key that is already recorded — the first
      // author to register the question owns it, and a later poster mistyping
      // the key would silently invalidate everyone's votes. Any backfill of
      // missing fields happens explicitly below.
      update: {},
      select: { id: true, officialAnswer: true },
    });
    questionId = question.id;

    if (isObjection && input.questionOptions) {
      // Options are created once per question. If they already exist, this
      // post joins the existing question rather than redefining its choices.
      const existing = await db.questionOption.count({
        where: { questionId: question.id },
      });

      if (existing === 0) {
        await db.questionOption.createMany({
          data: input.questionOptions.map((text, index) => ({
            questionId: question.id,
            label: OPTION_LABELS[index]!,
            text,
            sortOrder: index,
          })),
        });
      }

      // Backfill the key if the question was first created by a Memory post.
      if (!question.officialAnswer && input.officialAnswer) {
        await db.question.update({
          where: { id: question.id },
          data: { officialAnswer: input.officialAnswer },
        });
      }
    }
  }

  const post = await db.post.create({
    data: {
      authorId: user.id,
      boardId: board.id,
      examId: exam.id,
      phaseId: phase?.id ?? null,
      sessionId: session?.id ?? null,
      type: input.type,
      title: input.title,
      body: input.body,
      questionId,
      recallConfidence:
        input.type === "MEMORY_QUESTION" ? input.recallConfidence : null,
      cutoffBasis:
        input.type === "EXPECTED_CUTOFF" ? input.cutoffBasis : null,
      ...(input.type === "EXPECTED_CUTOFF" && input.cutoffPredictions
        ? {
            cutoffPredictions: {
              create: input.cutoffPredictions.map((p) => ({
                category: p.category,
                marks: p.marks,
              })),
            },
          }
        : {}),
      tags: { create: tagIds.map((tagId) => ({ tagId })) },
      ...(input.type === "POLL" && input.pollOptions
        ? {
            poll: {
              create: {
                question: input.title,
                options: {
                  create: input.pollOptions.map((o, i) => ({
                    label: o.label,
                    sortOrder: i + 1,
                  })),
                },
              },
            },
          }
        : {}),
      // A Memory Question's four choices are stored as a poll on the post, not
      // on the shared Question row: two people recalling the same paper will
      // word the options differently, so each recollection keeps its own set
      // and its own tally of what readers think the answer is.
      ...(input.type === "MEMORY_QUESTION" && input.questionOptions
        ? {
            poll: {
              create: {
                question: input.title,
                options: {
                  create: input.questionOptions.map((text, i) => ({
                    label: OPTION_LABELS[i]!,
                    text,
                    sortOrder: i,
                  })),
                },
              },
            },
          }
        : {}),
    },
    select: { id: true },
  });

  // An Official Update written here is the same announcement the admin
  // dashboard publishes, so it reaches the same people. Without this it
  // reached nobody, and which of the two screens staff happened to use decided
  // whether anyone heard about it.
  if (input.type === "OFFICIAL_UPDATE") {
    await notifyMany(await allUsers(user.id), {
      type: "OFFICIAL_UPDATE",
      message: `${exam.name}: ${input.title}`,
      postId: post.id,
    });
  }

  return ok({ id: post.id }, 201);
});
