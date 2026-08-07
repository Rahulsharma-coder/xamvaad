import Link from "next/link";
import { MessageCircle, Pin, ThumbsUp } from "lucide-react";
import { Avatar } from "./Avatar";
import { PostTypeBadge, TagRow } from "./Tags";
import { compactCount, timeAgo } from "@/lib/format";
import type { PostCard as PostCardData } from "@/lib/queries";
import { CATEGORY_LABEL, RECALL_CONFIDENCE } from "@/lib/rules";

/** Feed row — "Trending Posts" on the exam hub and every board feed. */
export function PostCard({ post }: { post: PostCardData }) {
  return (
    <article className="rounded-xl border border-hairline bg-surface p-4 transition hover:border-brand-200">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <Avatar
            name={post.author.name}
            image={post.author.image}
            size={28}
            official={post.author.role === "ADMIN"}
          />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-ink">
              {post.author.name}
              {post.author.role !== "USER" && (
                <span className="ml-1.5 rounded bg-brand-50 px-1.5 py-0.5 text-[10px] font-bold uppercase text-brand-700">
                  {post.author.role === "ADMIN" ? "Official" : "Mod"}
                </span>
              )}
            </p>
            <p className="text-xs text-ink-muted">
              {timeAgo(post.createdAt)}
              {post.editedAt && " · edited"}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {post.isPinned && <Pin size={14} className="text-brand-600" />}
          <PostTypeBadge type={post.type} />
        </div>
      </div>

      <Link href={`/posts/${post.id}`} className="mt-3 block group">
        <h3 className="font-bold leading-snug text-ink group-hover:text-brand-700">
          {post.title}
        </h3>
        {post.body && (
          <p className="mt-1 line-clamp-2 text-sm text-ink-muted">{post.body}</p>
        )}

        {/* Expected Cutoffs lead with the number people came for. */}
        {post.type === "EXPECTED_CUTOFF" && post.cutoffPredictions.length > 0 && (
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {post.cutoffPredictions.map((p) => (
              <li
                key={p.category}
                className="rounded-md bg-canvas px-2 py-1 text-xs text-ink-muted"
              >
                {CATEGORY_LABEL[p.category]}{" "}
                <span className="font-bold tabular-nums text-ink">{p.marks}</span>
              </li>
            ))}
          </ul>
        )}

        {/* Memory Questions show their recall strength up front — it tells a
            reader how much weight to give the wording before they open it. */}
        {post.type === "MEMORY_QUESTION" && post.recallConfidence && (
          <p className="mt-1.5 inline-flex items-center gap-1.5 text-xs text-ink-muted">
            <span className="h-1.5 w-10 overflow-hidden rounded-full bg-slate-200">
              <span
                className="block h-full rounded-full bg-brand-500"
                style={{
                  width: `${RECALL_CONFIDENCE[post.recallConfidence].percent}%`,
                }}
              />
            </span>
            {RECALL_CONFIDENCE[post.recallConfidence].label}
          </p>
        )}
      </Link>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3 text-xs font-medium text-ink-muted">
          <span className="inline-flex items-center gap-1">
            <ThumbsUp size={14} />
            {compactCount(post.likeCount)}
          </span>
          <span className="inline-flex items-center gap-1">
            <MessageCircle size={14} />
            {compactCount(post.commentCount)}
          </span>
          {post.poll && (
            <span className="rounded bg-violet-50 px-1.5 py-0.5 text-[10px] font-bold uppercase text-violet-700">
              Poll
            </span>
          )}
        </div>

        <TagRow tags={post.tags} max={3} />
      </div>
    </article>
  );
}
