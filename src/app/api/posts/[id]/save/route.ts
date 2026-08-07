import { db } from "@/lib/db";
import { ApiError, handler, ok } from "@/lib/api";
import { requireUser } from "@/lib/auth";

type Ctx = { params: Promise<{ id: string }> };

/** POST /api/posts/:id/save — toggles the bookmark. */
export const POST = handler(async (_req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const user = await requireUser();

  const post = await db.post.findFirst({
    where: { id, deletedAt: null },
    select: { id: true },
  });
  if (!post) throw new ApiError(404, "That post no longer exists.");

  const existing = await db.savedPost.findUnique({
    where: { userId_postId: { userId: user.id, postId: id } },
    select: { postId: true },
  });

  if (existing) {
    await db.savedPost.delete({
      where: { userId_postId: { userId: user.id, postId: id } },
    });
    return ok({ saved: false });
  }

  await db.savedPost.create({ data: { userId: user.id, postId: id } });
  return ok({ saved: true });
});
