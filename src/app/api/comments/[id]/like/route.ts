import { db } from "@/lib/db";
import { ApiError, handler, ok } from "@/lib/api";
import { requireUser } from "@/lib/auth";

type Ctx = { params: Promise<{ id: string }> };

export const POST = handler(async (_req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const user = await requireUser();

  const comment = await db.comment.findFirst({
    where: { id, deletedAt: null },
    select: { id: true },
  });
  if (!comment) throw new ApiError(404, "That comment no longer exists.");

  const existing = await db.commentLike.findUnique({
    where: { userId_commentId: { userId: user.id, commentId: id } },
    select: { commentId: true },
  });

  const result = await db.$transaction(async (tx) => {
    if (existing) {
      await tx.commentLike.delete({
        where: { userId_commentId: { userId: user.id, commentId: id } },
      });
      const updated = await tx.comment.update({
        where: { id },
        data: { likeCount: { decrement: 1 } },
        select: { likeCount: true },
      });
      return { liked: false, likeCount: updated.likeCount };
    }

    await tx.commentLike.create({ data: { userId: user.id, commentId: id } });
    const updated = await tx.comment.update({
      where: { id },
      data: { likeCount: { increment: 1 } },
      select: { likeCount: true },
    });
    return { liked: true, likeCount: updated.likeCount };
  });

  return ok(result);
});
