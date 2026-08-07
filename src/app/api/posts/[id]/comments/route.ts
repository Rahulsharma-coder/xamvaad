import { db } from "@/lib/db";
import { ApiError, handler, ok, pagination } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { createCommentSchema } from "@/lib/validation";
import { MAX_COMMENTS_PER_HOUR } from "@/lib/rules";

type Ctx = { params: Promise<{ id: string }> };

const commentSelect = {
  id: true,
  body: true,
  likeCount: true,
  createdAt: true,
  editedAt: true,
  parentId: true,
  author: {
    select: { id: true, name: true, username: true, image: true, role: true },
  },
} as const;

/** GET /api/posts/:id/comments — top-level comments with their replies. */
export const GET = handler(async (req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const url = new URL(req.url);
  const { skip, limit, page } = pagination(url, 20);
  const sort = url.searchParams.get("sort") === "top" ? "top" : "latest";

  const where = { postId: id, parentId: null, deletedAt: null };

  const [comments, total] = await Promise.all([
    db.comment.findMany({
      where,
      select: {
        ...commentSelect,
        replies: {
          where: { deletedAt: null },
          select: commentSelect,
          orderBy: { createdAt: "asc" },
        },
      },
      orderBy:
        sort === "top"
          ? [{ likeCount: "desc" }, { createdAt: "desc" }]
          : [{ createdAt: "desc" }],
      skip,
      take: limit,
    }),
    db.comment.count({ where }),
  ]);

  return ok({ comments, total, page, limit, hasMore: skip + comments.length < total });
});

/** POST /api/posts/:id/comments */
export const POST = handler(async (req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const user = await requireUser();
  const input = createCommentSchema.parse(await req.json());

  const post = await db.post.findFirst({
    where: { id, deletedAt: null, status: "ACTIVE" },
    select: { id: true, authorId: true },
  });
  if (!post) throw new ApiError(404, "That post no longer exists.");

  const recent = await db.comment.count({
    where: {
      authorId: user.id,
      createdAt: { gte: new Date(Date.now() - 60 * 60 * 1000) },
    },
  });
  if (recent >= MAX_COMMENTS_PER_HOUR) {
    throw new ApiError(429, "You're commenting too quickly. Take a short break.");
  }

  // Only one level of threading: replying to a reply attaches to its parent.
  let parentId: string | null = null;
  let parentAuthorId: string | null = null;
  if (input.parentId) {
    const parent = await db.comment.findFirst({
      where: { id: input.parentId, postId: id, deletedAt: null },
      select: { id: true, parentId: true, authorId: true },
    });
    if (!parent) throw new ApiError(404, "That comment no longer exists.");
    parentId = parent.parentId ?? parent.id;
    parentAuthorId = parent.authorId;
  }

  const comment = await db.$transaction(async (tx) => {
    const created = await tx.comment.create({
      data: { postId: id, authorId: user.id, parentId, body: input.body },
      select: commentSelect,
    });
    await tx.post.update({
      where: { id },
      data: { commentCount: { increment: 1 } },
    });
    return created;
  });

  // Notify the thread parent if replying, otherwise the post author.
  const recipient = parentAuthorId ?? post.authorId;
  if (recipient !== user.id) {
    await db.notification.create({
      data: {
        userId: recipient,
        actorId: user.id,
        type: parentId ? "COMMENT_REPLY" : "POST_COMMENT",
        message: parentId
          ? `${user.name} replied to your comment`
          : `${user.name} commented on your post`,
        postId: id,
        commentId: comment.id,
      },
    });
  }

  return ok({ comment }, 201);
});
