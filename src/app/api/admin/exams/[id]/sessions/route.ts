import { db } from "@/lib/db";
import { ApiError, handler, ok } from "@/lib/api";
import { assertBoardAllowed, requireAdminApi } from "@/lib/admin";
import { audit } from "@/lib/audit";
import { parseDay, sessionsSchema } from "@/lib/adminValidation";

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST /api/admin/exams/:id/sessions — define the shifts from the official
 * notification.
 *
 * More urgent than it looks: until the shifts exist, aspirants cannot tag a
 * post to the sitting they actually attended, which is the whole basis of the
 * platform's structure.
 */
export const POST = handler(async (req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const scope = await requireAdminApi();
  const input = sessionsSchema.parse(await req.json());

  const exam = await db.exam.findUnique({
    where: { id },
    select: { id: true, name: true, boardId: true },
  });
  if (!exam) throw new ApiError(404, "That exam no longer exists.");
  assertBoardAllowed(scope, exam.boardId);

  // Shifts belong to a tier, not to the exam: CGL Tier 1 and Tier 2 each hold
  // their own "Shift 1" months apart.
  const phase = await db.examPhase.findFirst({
    where: { id: input.phaseId, examId: id },
    select: { id: true, name: true },
  });
  if (!phase) {
    throw new ApiError(400, "That phase doesn't belong to this exam.");
  }

  // skipDuplicates so re-submitting the notification is harmless.
  const result = await db.examSession.createMany({
    data: input.sessions.map((s) => ({
      phaseId: phase.id,
      examId: id,
      date: parseDay(s.date)!,
      shift: s.shift,
    })),
    skipDuplicates: true,
  });

  await audit({
    actor: scope.user,
    action: "exam.sessions.create",
    targetType: "Exam",
    targetId: id,
    summary: `Added ${result.count} shift${result.count === 1 ? "" : "s"} to ${exam.name} ${phase.name}`,
  });

  return ok({ created: result.count, skipped: input.sessions.length - result.count });
});

/** DELETE /api/admin/exams/:id/sessions?sessionId= — remove an empty shift. */
export const DELETE = handler(async (req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const scope = await requireAdminApi();

  const sessionId = new URL(req.url).searchParams.get("sessionId");
  if (!sessionId) throw new ApiError(400, "Which shift?");

  const session = await db.examSession.findFirst({
    where: { id: sessionId, examId: id },
    select: {
      id: true,
      shift: true,
      exam: { select: { name: true, boardId: true } },
      _count: { select: { posts: true, questions: true } },
    },
  });
  if (!session) throw new ApiError(404, "That shift no longer exists.");
  assertBoardAllowed(scope, session.exam.boardId);

  // Deleting a shift would cascade its questions and orphan real discussion.
  if (session._count.posts > 0 || session._count.questions > 0) {
    throw new ApiError(
      409,
      `That shift has ${session._count.posts} posts and ${session._count.questions} questions. Only empty shifts can be deleted.`
    );
  }

  await db.examSession.delete({ where: { id: sessionId } });

  await audit({
    actor: scope.user,
    action: "exam.session.delete",
    targetType: "Exam",
    targetId: id,
    summary: `Removed empty shift "${session.shift}" from ${session.exam.name}`,
  });

  return ok({ success: true });
});
