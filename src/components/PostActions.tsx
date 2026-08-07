"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bookmark, MessageCircle, Share2, ThumbsUp } from "lucide-react";
import clsx from "clsx";
import { api } from "@/lib/client";
import { compactCount } from "@/lib/format";

/** The action row under a post (wireframe 05). */
export function PostActions({
  postId,
  initialLikeCount,
  initialLiked,
  commentCount,
  initialSaved,
  signedIn,
  onCommentClick,
}: {
  postId: string;
  initialLikeCount: number;
  initialLiked: boolean;
  commentCount: number;
  initialSaved: boolean;
  signedIn: boolean;
  onCommentClick?: () => void;
}) {
  const router = useRouter();
  const [liked, setLiked] = useState(initialLiked);
  const [likeCount, setLikeCount] = useState(initialLikeCount);
  const [saved, setSaved] = useState(initialSaved);
  const [shared, setShared] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function requireSignIn() {
    router.push(`/login?next=/posts/${postId}`);
  }

  async function toggleLike() {
    if (!signedIn) return requireSignIn();

    // Optimistic: flip immediately, roll back if the request fails.
    const previous = { liked, likeCount };
    setLiked(!liked);
    setLikeCount(likeCount + (liked ? -1 : 1));
    setError(null);

    try {
      const result = await api<{ liked: boolean; likeCount: number }>(
        `/api/posts/${postId}/like`,
        { method: "POST" }
      );
      setLiked(result.liked);
      setLikeCount(result.likeCount);
      startTransition(() => router.refresh());
    } catch (err) {
      setLiked(previous.liked);
      setLikeCount(previous.likeCount);
      setError(err instanceof Error ? err.message : "Could not save that.");
    }
  }

  async function toggleSave() {
    if (!signedIn) return requireSignIn();
    const previous = saved;
    setSaved(!saved);
    try {
      const result = await api<{ saved: boolean }>(`/api/posts/${postId}/save`, {
        method: "POST",
      });
      setSaved(result.saved);
    } catch (err) {
      setSaved(previous);
      setError(err instanceof Error ? err.message : "Could not save that.");
    }
  }

  async function share() {
    const url = `${window.location.origin}/posts/${postId}`;
    // Native share sheet on mobile, clipboard everywhere else.
    if (navigator.share) {
      try {
        await navigator.share({ url, title: "Xamvaad" });
        return;
      } catch {
        // User dismissed the sheet — fall through to copy.
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setShared(true);
      setTimeout(() => setShared(false), 2000);
    } catch {
      setError("Could not copy the link.");
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-1">
        <ActionButton
          active={liked}
          onClick={toggleLike}
          icon={<ThumbsUp size={16} strokeWidth={2.2} />}
          label={compactCount(likeCount)}
          srLabel={liked ? "Unlike this post" : "Like this post"}
        />
        <ActionButton
          onClick={onCommentClick}
          icon={<MessageCircle size={16} strokeWidth={2.2} />}
          label={compactCount(commentCount)}
          srLabel="Jump to comments"
        />
        <ActionButton
          active={saved}
          onClick={toggleSave}
          icon={<Bookmark size={16} strokeWidth={2.2} />}
          label={saved ? "Saved" : "Save"}
          srLabel={saved ? "Remove from saved" : "Save this post"}
        />
        <ActionButton
          onClick={share}
          icon={<Share2 size={16} strokeWidth={2.2} />}
          label={shared ? "Copied" : "Share"}
          srLabel="Share this post"
        />
      </div>

      {error && (
        <p role="alert" className="mt-2 text-xs text-object">
          {error}
        </p>
      )}
    </div>
  );
}

function ActionButton({
  icon,
  label,
  srLabel,
  active,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  srLabel: string;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={srLabel}
      className={clsx(
        "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium transition",
        active
          ? "bg-brand-50 text-brand-700"
          : "text-ink-muted hover:bg-slate-100 hover:text-ink"
      )}
    >
      {icon}
      {label}
    </button>
  );
}
