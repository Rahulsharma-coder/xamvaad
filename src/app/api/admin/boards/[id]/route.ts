import { db } from "@/lib/db";
import { ApiError, handler, ok } from "@/lib/api";
import { requireFullAdminApi } from "@/lib/admin";
import { audit } from "@/lib/audit";

type Ctx = { params: Promise<{ id: string }> };

/**
 * DELETE /api/admin/boards/:id — remove an empty board.
 *
 * Board deletion cascades all the way down: exams, phases, sittings, posts,
 * comments, votes. That is far too much to hang off one button, so a board
 * that still has exams cannot be deleted at all. Emptying it first is a
 * deliberate sequence of decisions rather than a single misclick.
 *
 * The equivalent of "delete but keep the history" is deactivating the board,
 * which hides it from aspirants and leaves its content searchable.
 */
export const DELETE = handler(async (_req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const admin = await requireFullAdminApi();

  const board = await db.board.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      // Live posts only, matching the exam and phase guards: a soft-deleted
      // post is already gone as far as anyone using the site is concerned.
      _count: {
        select: { exams: true, posts: { where: { deletedAt: null } } },
      },
    },
  });

  if (!board) throw new ApiError(404, "That board no longer exists.");

  if (board._count.exams > 0) {
    throw new ApiError(
      409,
      `${board.name} still has ${board._count.exams} exam${
        board._count.exams === 1 ? "" : "s"
      }. Delete or archive those first, or deactivate the board to hide it instead.`
    );
  }

  if (board._count.posts > 0) {
    throw new ApiError(
      409,
      `${board.name} still has ${board._count.posts} post${
        board._count.posts === 1 ? "" : "s"
      }. Deactivate the board instead — deleting it would destroy them.`
    );
  }

  await db.board.delete({ where: { id } });

  await audit({
    actor: admin,
    action: "board.delete",
    targetType: "Board",
    targetId: id,
    summary: `Deleted empty board ${board.name}`,
  });

  return ok({ success: true });
});
