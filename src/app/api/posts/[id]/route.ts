import { db } from "@/lib/db";
import { ApiError, handler, ok } from "@/lib/api";
import { canModifyPost, getCurrentUser, isStaff, requireUser } from "@/lib/auth";
import { getPost } from "@/lib/queries";
import { updatePostSchema } from "@/lib/validation";
import { withinEditWindow } from "@/lib/rules";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handler(async (_req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const post = await getPost(id);
  if (!post || post.status === "REMOVED") {
    throw new ApiError(404, "That post no longer exists.");
  }

  const user = await getCurrentUser();
  if (post.status === "HIDDEN" && post.author.id !== user?.id && !isStaff(user)) {
    throw new ApiError(404, "That post no longer exists.");
  }

  // Fire-and-forget view count; a failure here must not break the read.
  db.post
    .update({ where: { id }, data: { viewCount: { increment: 1 } } })
    .catch(() => {});

  return ok({ post });
});

export const PATCH = handler(async (req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const user = await requireUser();

  const post = await db.post.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, authorId: true, createdAt: true },
  });
  if (!post) throw new ApiError(404, "That post no longer exists.");
  if (!canModifyPost(user, post.authorId)) {
    throw new ApiError(403, "You can only edit your own posts.");
  }
  if (!isStaff(user) && !withinEditWindow(post.createdAt)) {
    throw new ApiError(
      403,
      "The edit window for this post has closed. Add a comment instead."
    );
  }

  const input = updatePostSchema.parse(await req.json());
  if (!input.title && !input.body) {
    throw new ApiError(400, "Nothing to update.");
  }

  await db.post.update({
    where: { id },
    data: { ...input, editedAt: new Date() },
  });

  return ok({ success: true });
});

/** Soft delete — the row is retained for moderation history. */
export const DELETE = handler(async (_req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const user = await requireUser();

  const post = await db.post.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, authorId: true },
  });
  if (!post) throw new ApiError(404, "That post no longer exists.");
  if (!canModifyPost(user, post.authorId)) {
    throw new ApiError(403, "You can only delete your own posts.");
  }

  await db.post.update({
    where: { id },
    data: { deletedAt: new Date(), status: "REMOVED" },
  });

  return ok({ success: true });
});
