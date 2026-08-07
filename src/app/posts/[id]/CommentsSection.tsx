import { db } from "@/lib/db";
import { Comments, type CommentNode } from "@/components/Comments";

/**
 * Comment loading, split out so it can stream behind a skeleton.
 *
 * The post itself must be fetched in the page — that lookup decides whether to
 * call notFound(), and it has to happen before anything is flushed for the 404
 * status to stick. Comments have no such constraint and are the slowest query
 * on the page, so they resolve separately while the post is already readable.
 */
export async function CommentsSection({
  postId,
  commentCount,
  signedIn,
  currentUserId,
}: {
  postId: string;
  commentCount: number;
  signedIn: boolean;
  currentUserId: string | null;
}) {
  const authorSelect = {
    id: true,
    name: true,
    username: true,
    image: true,
    role: true,
  } as const;

  const [comments, likedComments] = await Promise.all([
    db.comment.findMany({
      where: { postId, parentId: null, deletedAt: null },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        body: true,
        likeCount: true,
        createdAt: true,
        editedAt: true,
        parentId: true,
        author: { select: authorSelect },
        replies: {
          where: { deletedAt: null },
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            body: true,
            likeCount: true,
            createdAt: true,
            editedAt: true,
            parentId: true,
            author: { select: authorSelect },
          },
        },
      },
    }),
    currentUserId
      ? db.commentLike.findMany({
          where: { userId: currentUserId, comment: { postId } },
          select: { commentId: true },
        })
      : Promise.resolve([]),
  ]);

  return (
    <Comments
      postId={postId}
      initialComments={comments as unknown as CommentNode[]}
      total={commentCount}
      signedIn={signedIn}
      currentUserId={currentUserId}
      likedCommentIds={likedComments.map((like) => like.commentId)}
    />
  );
}
