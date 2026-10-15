import { db } from "@/lib/db";
import { ApiError, handler, ok } from "@/lib/api";
import { assertBoardAllowed, requireAdminApi } from "@/lib/admin";
import { audit } from "@/lib/audit";
import { feedKeywordsSchema } from "@/lib/adminValidation";

type Ctx = { params: Promise<{ id: string }> };

/**
 * PATCH /api/admin/exams/:id — set the phrases the Sarkari Result feed is
 * matched against. An empty list stops the exam being auto-announced.
 */
export const PATCH = handler(async (req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const scope = await requireAdminApi();
  const { feedKeywords } = feedKeywordsSchema.parse(await req.json());

  const exam = await db.exam.findUnique({
    where: { id },
    select: { id: true, name: true, boardId: true },
  });
  if (!exam) throw new ApiError(404, "That exam no longer exists.");
  assertBoardAllowed(scope, exam.boardId);

  // Case-insensitive duplicates would only make the list longer to read.
  const unique = [
    ...new Map(feedKeywords.map((p) => [p.toLowerCase(), p])).values(),
  ];

  await db.exam.update({ where: { id }, data: { feedKeywords: unique } });

  await audit({
    actor: scope.user,
    action: "exam.feed_keywords",
    targetType: "Exam",
    targetId: id,
    summary: `Set feed keywords for ${exam.name}: ${unique.join(", ") || "(none)"}`,
  });

  return ok({ feedKeywords: unique });
});

/**
 * DELETE /api/admin/exams/:id — remove an exam nobody has posted in.
 *
 * Only ever for correcting a mistake: a typo'd name, a duplicate, an exam
 * created under the wrong board. An exam that aspirants have used is history —
 * their recollections and objections are the point of the product — so once it
 * holds posts or tracked questions this refuses, and archiving is the answer.
 *
 * Phases and their lifecycle stages go with it. Those are scaffolding created
 * alongside the exam, not content anyone contributed.
 */
export const DELETE = handler(async (_req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const scope = await requireAdminApi();

  const exam = await db.exam.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      boardId: true,
      // Live posts only — a soft-deleted one is already invisible to
      // aspirants, so it should not stand between an admin and a mistake
      // they are trying to undo.
      _count: {
        select: { posts: { where: { deletedAt: null } }, questions: true },
      },
    },
  });

  if (!exam) throw new ApiError(404, "That exam no longer exists.");
  assertBoardAllowed(scope, exam.boardId);

  const { posts, questions } = exam._count;
  if (posts > 0 || questions > 0) {
    const parts = [
      posts > 0 ? `${posts} post${posts === 1 ? "" : "s"}` : null,
      questions > 0
        ? `${questions} tracked question${questions === 1 ? "" : "s"}`
        : null,
    ].filter(Boolean);

    throw new ApiError(
      409,
      `${exam.name} has ${parts.join(" and ")}. Archive it instead — deleting would destroy what aspirants wrote.`
    );
  }

  await db.exam.delete({ where: { id } });

  await audit({
    actor: scope.user,
    action: "exam.delete",
    targetType: "Exam",
    targetId: id,
    summary: `Deleted empty exam ${exam.name}`,
  });

  return ok({ success: true });
});
