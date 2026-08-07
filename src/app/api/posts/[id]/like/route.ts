import { db } from "@/lib/db";
import { ApiError, handler, ok } from "@/lib/api";
import { requireUser } from "@/lib/auth";

type Ctx = { params: Promise<{ id: string }> };

/** POST /api/posts/:id/like — toggles the like and returns the new state. */
export const POST = handler(async (_req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const user = await requireUser();

  const post = await db.post.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, authorId: true, title: true },
  });
  if (!post) throw new ApiError(404, "That post no longer exists.");

  const existing = await db.postLike.findUnique({
    where: { userId_postId: { userId: user.id, postId: id } },
    select: { postId: true },
  });

  // The delete/create and the counter update must not drift apart.
  const result = await db.$transaction(async (tx) => {
    if (existing) {
      await tx.postLike.delete({
        where: { userId_postId: { userId: user.id, postId: id } },
      });
      const updated = await tx.post.update({
        where: { id },
        data: { likeCount: { decrement: 1 } },
        select: { likeCount: true },
      });
      return { liked: false, likeCount: updated.likeCount };
    }

    await tx.postLike.create({ data: { userId: user.id, postId: id } });
    const updated = await tx.post.update({
      where: { id },
      data: { likeCount: { increment: 1 } },
      select: { likeCount: true },
    });
    return { liked: true, likeCount: updated.likeCount };
  });

  // Notify the author, but never for self-likes.
  if (result.liked && post.authorId !== user.id) {
    await db.notification.create({
      data: {
        userId: post.authorId,
        actorId: user.id,
        type: "POST_LIKE",
        message: `${user.name} liked your post`,
        postId: id,
      },
    });
  }

  return ok(result);
});
