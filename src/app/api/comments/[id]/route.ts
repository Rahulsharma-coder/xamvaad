import { db } from "@/lib/db";
import { ApiError, handler, ok } from "@/lib/api";
import { canModifyPost, requireUser } from "@/lib/auth";

type Ctx = { params: Promise<{ id: string }> };

/** Soft-deletes a comment and keeps the post's counter in step. */
export const DELETE = handler(async (_req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const user = await requireUser();

  const comment = await db.comment.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, authorId: true, postId: true },
  });
  if (!comment) throw new ApiError(404, "That comment no longer exists.");
  if (!canModifyPost(user, comment.authorId)) {
    throw new ApiError(403, "You can only delete your own comments.");
  }

  await db.$transaction(async (tx) => {
    await tx.comment.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    await tx.post.update({
      where: { id: comment.postId },
      data: { commentCount: { decrement: 1 } },
    });
  });

  return ok({ success: true });
});
