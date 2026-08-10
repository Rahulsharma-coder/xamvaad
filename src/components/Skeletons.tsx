/**
 * Content-shaped placeholders.
 *
 * Each one mirrors the real component's layout so the page doesn't jump when
 * the data arrives — a generic spinner would reserve no space and cause the
 * same jolt the skeletons exist to avoid.
 *
 * Server components: they render inside <Suspense fallback> and hold no state.
 */

function Bar({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-slate-200 ${className}`} />;
}

/** Matches PostCard: tag row, title, two body lines, author, action row. */
export function PostCardSkeleton() {
  return (
    <div className="rounded-xl border border-hairline bg-surface p-4">
      <div className="flex gap-1.5">
        <Bar className="h-4 w-12" />
        <Bar className="h-4 w-16" />
        <Bar className="h-4 w-14" />
      </div>

      <Bar className="mt-3 h-5 w-3/4" />
      <Bar className="mt-2 h-3.5 w-full" />
      <Bar className="mt-1.5 h-3.5 w-5/6" />

      <div className="mt-3 flex items-center gap-2">
        <Bar className="h-8 w-8 rounded-full" />
        <div className="flex-1">
          <Bar className="h-3 w-28" />
          <Bar className="mt-1 h-2.5 w-20" />
        </div>
      </div>

      <div className="mt-3 flex gap-4 border-t border-hairline pt-3">
        <Bar className="h-4 w-12" />
        <Bar className="h-4 w-12" />
        <Bar className="h-4 w-12" />
      </div>
    </div>
  );
}

export function FeedSkeleton({ count = 4 }: { count?: number }) {
  return (
    <ul className="space-y-3" aria-busy="true" aria-label="Loading posts">
      {Array.from({ length: count }, (_, i) => (
        <li key={i}>
          <PostCardSkeleton />
        </li>
      ))}
    </ul>
  );
}

/** Matches the Comments block: heading, then avatar + two lines per comment. */
export function CommentsSkeleton({ count = 3 }: { count?: number }) {
  return (
    <section
      className="rounded-xl border border-hairline bg-surface p-4"
      aria-busy="true"
      aria-label="Loading comments"
    >
      <Bar className="h-4 w-28" />

      <ul className="mt-4 space-y-4">
        {Array.from({ length: count }, (_, i) => (
          <li key={i} className="flex gap-2.5">
            <Bar className="h-8 w-8 shrink-0 rounded-full" />
            <div className="min-w-0 flex-1">
              <Bar className="h-3 w-24" />
              <Bar className="mt-2 h-3.5 w-full" />
              <Bar className="mt-1.5 h-3.5 w-4/5" />
              <Bar className="mt-2 h-3 w-16" />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Matches the "Active Exams" rows on the home screen. */
export function ExamListSkeleton({ count = 4 }: { count?: number }) {
  return (
    <ul className="space-y-2" aria-busy="true" aria-label="Loading exams">
      {Array.from({ length: count }, (_, i) => (
        <li
          key={i}
          className="flex items-center gap-3 rounded-xl border border-hairline bg-surface p-3"
        >
          <Bar className="h-9 w-9 shrink-0 rounded-lg" />
          <div className="min-w-0 flex-1">
            <Bar className="h-4 w-40" />
            <Bar className="mt-1.5 h-3 w-28" />
          </div>
          <Bar className="h-3 w-16 shrink-0" />
        </li>
      ))}
    </ul>
  );
}

/** Matches the board rail tiles. */
export function BoardRailSkeleton({ count = 6 }: { count?: number }) {
  return (
    <ul className="flex gap-3 overflow-hidden" aria-busy="true">
      {Array.from({ length: count }, (_, i) => (
        <li key={i} className="flex w-16 shrink-0 flex-col items-center gap-1.5">
          <Bar className="h-11 w-11 rounded-full" />
          <Bar className="h-2.5 w-10" />
        </li>
      ))}
    </ul>
  );
}

/** Matches the Objection Tracker rows. */
export function TrackerSkeleton({ count = 4 }: { count?: number }) {
  return (
    <ul className="space-y-2" aria-busy="true" aria-label="Loading questions">
      {Array.from({ length: count }, (_, i) => (
        <li
          key={i}
          className="flex items-center gap-3 rounded-xl border border-hairline bg-surface p-3"
        >
          <Bar className="h-8 w-8 shrink-0 rounded-lg" />
          <div className="min-w-0 flex-1">
            <Bar className="h-4 w-24" />
            <Bar className="mt-1.5 h-3 w-36" />
          </div>
          <Bar className="h-6 w-12 shrink-0 rounded-md" />
        </li>
      ))}
    </ul>
  );
}
