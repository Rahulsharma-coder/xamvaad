import { db } from "@/lib/db";
import { ApiError, handler, ok } from "@/lib/api";
import { assertBoardAllowed, requireAdminApi } from "@/lib/admin";
import { audit } from "@/lib/audit";

type Ctx = { params: Promise<{ id: string }> };

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
      _count: { select: { posts: true, questions: true } },
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
