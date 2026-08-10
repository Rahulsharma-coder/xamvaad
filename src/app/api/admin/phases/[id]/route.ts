import { db } from "@/lib/db";
import { ApiError, handler, ok } from "@/lib/api";
import { assertBoardAllowed, requireAdminApi } from "@/lib/admin";
import { audit } from "@/lib/audit";

type Ctx = { params: Promise<{ id: string }> };

/**
 * DELETE /api/admin/phases/:id — remove a phase nobody has used.
 *
 * Refuses on posts, tracked questions or defined sittings. Sittings count
 * because they come from the official notification: if someone has entered
 * them, the phase is real and scheduled, and deleting it would silently drop
 * dates aspirants are relying on.
 *
 * An exam must keep at least one phase. Posts hang off a phase, so an exam
 * with none cannot be posted in and would look broken rather than empty.
 */
export const DELETE = handler(async (_req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const scope = await requireAdminApi();

  const phase = await db.examPhase.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      exam: {
        select: {
          id: true,
          name: true,
          boardId: true,
          _count: { select: { phases: true } },
        },
      },
      // Live posts only. Deleting a post soft-deletes it — the row stays so
      // moderation and reports keep their target — but counting tombstones
      // means an admin who has cleared every visible post is told the phase
      // still holds two, with nothing on screen to reconcile that against.
      _count: {
        select: {
          posts: { where: { deletedAt: null } },
          questions: true,
          sessions: true,
        },
      },
    },
  });

  if (!phase) throw new ApiError(404, "That phase no longer exists.");
  assertBoardAllowed(scope, phase.exam.boardId);

  if (phase.exam._count.phases <= 1) {
    throw new ApiError(
      409,
      `${phase.exam.name} would be left with no phases. Add the replacement first, then delete this one.`
    );
  }

  const { posts, questions, sessions } = phase._count;
  if (posts > 0 || questions > 0 || sessions > 0) {
    const parts = [
      posts > 0 ? `${posts} post${posts === 1 ? "" : "s"}` : null,
      questions > 0
        ? `${questions} tracked question${questions === 1 ? "" : "s"}`
        : null,
      sessions > 0 ? `${sessions} shift${sessions === 1 ? "" : "s"}` : null,
    ].filter(Boolean);

    throw new ApiError(
      409,
      `${phase.name} has ${parts.join(", ")}. Remove those first if this phase really is a mistake.`
    );
  }

  await db.examPhase.delete({ where: { id } });

  await audit({
    actor: scope.user,
    action: "exam.phase.delete",
    targetType: "Exam",
    targetId: phase.exam.id,
    summary: `Deleted empty phase ${phase.name} from ${phase.exam.name}`,
  });

  return ok({ success: true });
});
