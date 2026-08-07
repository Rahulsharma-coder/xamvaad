import Link from "next/link";
import clsx from "clsx";
import type { PostType } from "@/prisma/client";
import { POST_TYPE_LABEL } from "@/lib/rules";

/** Auto-generated metadata hashtags are clickable filters (PRD Part 2). */
export function TagChip({
  name,
  label,
  className,
}: {
  name: string;
  label: string;
  className?: string;
}) {
  return (
    <Link
      href={`/search?tag=${encodeURIComponent(name)}`}
      className={clsx(
        "text-xs font-semibold text-brand-600 transition hover:text-brand-800 hover:underline",
        className
      )}
    >
      #{label}
    </Link>
  );
}

export function TagRow({
  tags,
  max = 6,
}: {
  tags: { tag: { name: string; label: string } }[];
  max?: number;
}) {
  if (!tags.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
      {tags.slice(0, max).map(({ tag }) => (
        <TagChip key={tag.name} name={tag.name} label={tag.label} />
      ))}
    </div>
  );
}

const TYPE_TONE: Record<PostType, string> = {
  DISCUSSION: "bg-brand-50 text-brand-700",
  POLL: "bg-violet-50 text-violet-700",
  MEMORY_QUESTION: "bg-sky-50 text-sky-700",
  EXPECTED_CUTOFF: "bg-emerald-50 text-emerald-700",
  OFFICIAL_UPDATE: "bg-slate-900 text-white",
  // Red, matching the objection language used across the tracker.
  OBJECTION_QUESTION: "bg-red-50 text-object",
};

export function PostTypeBadge({ type }: { type: PostType }) {
  return (
    <span
      className={clsx(
        "rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
        TYPE_TONE[type]
      )}
    >
      {POST_TYPE_LABEL[type]}
    </span>
  );
}
