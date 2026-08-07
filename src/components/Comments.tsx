"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ThumbsUp } from "lucide-react";
import clsx from "clsx";
import { Avatar } from "./Avatar";
import { api } from "@/lib/client";
import { compactCount, timeAgo } from "@/lib/format";
import { COMMENT_MAX } from "@/lib/rules";

type CommentAuthor = {
  id: string;
  name: string;
  username: string;
  image: string | null;
  role: string;
};

export type CommentNode = {
  id: string;
  body: string;
  likeCount: number;
  createdAt: string | Date;
  editedAt: string | Date | null;
  parentId: string | null;
  author: CommentAuthor;
  replies?: CommentNode[];
};

/** Comment thread from wireframe 05, including the reply affordance. */
export function Comments({
  postId,
  initialComments,
  total,
  signedIn,
  currentUserId,
  likedCommentIds,
}: {
  postId: string;
  initialComments: CommentNode[];
  total: number;
  signedIn: boolean;
  currentUserId: string | null;
  likedCommentIds: string[];
}) {
  const router = useRouter();
  const [comments, setComments] = useState(initialComments);
  const [sort, setSort] = useState<"latest" | "top">("latest");
  const [body, setBody] = useState("");
  const [replyTo, setReplyTo] = useState<CommentNode | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const liked = new Set(likedCommentIds);

  async function reload(nextSort: "latest" | "top") {
    setSort(nextSort);
    try {
      const result = await api<{ comments: CommentNode[] }>(
        `/api/posts/${postId}/comments?sort=${nextSort}`
      );
      setComments(result.comments);
    } catch {
      // Keep the existing list rather than blanking the thread.
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!signedIn) {
      router.push(`/login?next=/posts/${postId}`);
      return;
    }
    if (!body.trim()) return;

    setBusy(true);
    setError(null);
    try {
      await api(`/api/posts/${postId}/comments`, {
        method: "POST",
        json: { body: body.trim(), parentId: replyTo?.id ?? null },
      });
      setBody("");
      setReplyTo(null);
      await reload(sort);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not post that.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section id="comments" className="rounded-xl border border-hairline bg-surface p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-bold text-ink">
          Comments ({compactCount(total)})
        </h2>

        <div className="flex items-center gap-1 text-xs">
          {(["latest", "top"] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => reload(option)}
              className={clsx(
                "rounded-md px-2 py-1 font-semibold capitalize transition",
                sort === option
                  ? "bg-brand-50 text-brand-700"
                  : "text-ink-muted hover:bg-slate-100"
              )}
            >
              {option}
            </button>
          ))}
        </div>
      </div>

      <form onSubmit={submit} className="mt-3">
        {replyTo && (
          <div className="mb-2 flex items-center justify-between rounded-lg bg-brand-50 px-3 py-1.5 text-xs text-brand-800">
            <span>Replying to {replyTo.author.name}</span>
            <button
              type="button"
              onClick={() => setReplyTo(null)}
              className="font-semibold underline"
            >
              Cancel
            </button>
          </div>
        )}

        <textarea
          value={body}
          onChange={(event) => setBody(event.target.value)}
          maxLength={COMMENT_MAX}
          rows={3}
          placeholder={
            signedIn ? "Add to the discussion..." : "Sign in to join the discussion"
          }
          className="w-full resize-y rounded-lg border border-hairline bg-canvas px-3 py-2 text-sm outline-none transition placeholder:text-slate-400 focus:border-brand-400 focus:bg-surface"
        />

        <div className="mt-2 flex items-center justify-between gap-3">
          <span className="text-xs text-ink-muted">
            {body.length}/{COMMENT_MAX}
          </span>
          <button
            type="submit"
            disabled={busy || !body.trim()}
            className="rounded-lg bg-brand-600 px-4 py-1.5 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-50"
          >
            {busy ? "Posting..." : replyTo ? "Reply" : "Comment"}
          </button>
        </div>

        {error && (
          <p role="alert" className="mt-2 text-xs text-object">
            {error}
          </p>
        )}
      </form>

      <ul className="mt-4 space-y-4">
        {comments.length === 0 && (
          <li className="py-6 text-center text-sm text-ink-muted">
            No comments yet. Be the first to weigh in.
          </li>
        )}

        {comments.map((comment) => (
          <CommentRow
            key={comment.id}
            comment={comment}
            postId={postId}
            signedIn={signedIn}
            currentUserId={currentUserId}
            liked={liked}
            onReply={setReplyTo}
          />
        ))}
      </ul>
    </section>
  );
}

function CommentRow({
  comment,
  postId,
  signedIn,
  currentUserId,
  liked,
  onReply,
  depth = 0,
}: {
  comment: CommentNode;
  postId: string;
  signedIn: boolean;
  currentUserId: string | null;
  liked: Set<string>;
  onReply: (comment: CommentNode) => void;
  depth?: number;
}) {
  const router = useRouter();
  const [likeCount, setLikeCount] = useState(comment.likeCount);
  const [isLiked, setIsLiked] = useState(liked.has(comment.id));
  const [removed, setRemoved] = useState(false);

  if (removed) return null;

  async function toggleLike() {
    if (!signedIn) {
      router.push(`/login?next=/posts/${postId}`);
      return;
    }
    const previous = { isLiked, likeCount };
    setIsLiked(!isLiked);
    setLikeCount(likeCount + (isLiked ? -1 : 1));
    try {
      const result = await api<{ liked: boolean; likeCount: number }>(
        `/api/comments/${comment.id}/like`,
        { method: "POST" }
      );
      setIsLiked(result.liked);
      setLikeCount(result.likeCount);
    } catch {
      setIsLiked(previous.isLiked);
      setLikeCount(previous.likeCount);
    }
  }

  async function remove() {
    if (!confirm("Delete this comment?")) return;
    try {
      await api(`/api/comments/${comment.id}`, { method: "DELETE" });
      setRemoved(true);
      router.refresh();
    } catch {
      // Leave the comment in place if the delete failed.
    }
  }

  return (
    <li className={clsx(depth > 0 && "ml-8 border-l border-hairline pl-3")}>
      <div className="flex gap-2.5">
        <Avatar name={comment.author.name} image={comment.author.image} size={28} />

        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-x-2 text-sm">
            <span className="font-semibold text-ink">{comment.author.name}</span>
            {comment.author.role !== "USER" && (
              <span className="rounded bg-brand-50 px-1.5 py-0.5 text-[10px] font-bold uppercase text-brand-700">
                {comment.author.role === "ADMIN" ? "Official" : "Mod"}
              </span>
            )}
            <span className="text-xs text-ink-muted">
              {timeAgo(comment.createdAt)}
            </span>
          </p>

          <p className="mt-1 whitespace-pre-line text-sm text-ink">{comment.body}</p>

          <div className="mt-1.5 flex items-center gap-3 text-xs">
            <button
              type="button"
              onClick={toggleLike}
              className={clsx(
                "inline-flex items-center gap-1 font-medium transition",
                isLiked ? "text-brand-600" : "text-ink-muted hover:text-ink"
              )}
            >
              <ThumbsUp size={13} />
              {compactCount(likeCount)}
            </button>

            {depth === 0 && (
              <button
                type="button"
                onClick={() => onReply(comment)}
                className="font-medium text-ink-muted transition hover:text-ink"
              >
                Reply
              </button>
            )}

            {currentUserId === comment.author.id && (
              <button
                type="button"
                onClick={remove}
                className="font-medium text-ink-muted transition hover:text-object"
              >
                Delete
              </button>
            )}
          </div>
        </div>
      </div>

      {comment.replies && comment.replies.length > 0 && (
        <ul className="mt-3 space-y-3">
          {comment.replies.map((reply) => (
            <CommentRow
              key={reply.id}
              comment={reply}
              postId={postId}
              signedIn={signedIn}
              currentUserId={currentUserId}
              liked={liked}
              onReply={onReply}
              depth={depth + 1}
            />
          ))}
        </ul>
      )}
    </li>
  );
}
