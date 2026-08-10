import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { PostType } from "@/prisma/client";
import { FeedSkeleton } from "@/components/Skeletons";
import { db } from "@/lib/db";
import { getFeed } from "@/lib/queries";
import { examDate } from "@/lib/format";
import { DetailBar } from "@/components/TopBar";
import { PostCard } from "@/components/PostCard";
import { BoardIcon } from "@/components/BoardIcon";
import { FeedFilters } from "@/components/FeedFilters";

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{
    exam?: string;
    date?: string;
    shift?: string;
    type?: string;
    sort?: string;
  }>;
};

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  const board = await db.board
    .findUnique({ where: { slug }, select: { name: true } })
    .catch(() => null);
  return { title: board?.name ?? "Board" };
}

/**
 * Board Feed (PRD Part 2) — posts scoped to one board, with the four filters
 * the PRD specifies: Exam, Date, Shift and Post Type.
 */
export default async function BoardFeedPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const filters = await searchParams;

  const board = await db.board.findUnique({
    where: { slug },
    select: {
      id: true,
      slug: true,
      name: true,
      fullName: true,
      description: true,
      icon: true,
      image: true,
      color: true,
      exams: {
        orderBy: [{ year: "desc" }, { name: "asc" }],
        select: {
          id: true,
          slug: true,
          name: true,
          sessions: {
            orderBy: [{ date: "desc" }, { shift: "asc" }],
            select: { id: true, date: true, shift: true },
          },
        },
      },
    },
  });
  if (!board) notFound();

  // Distinct dates and shifts across this board, for the filter selects.
  const dates = Array.from(
    new Set(
      board.exams.flatMap((exam) =>
        exam.sessions.map((s) => new Date(s.date).toISOString().slice(0, 10))
      )
    )
  ).sort((a, b) => b.localeCompare(a));

  const shifts = Array.from(
    new Set(board.exams.flatMap((exam) => exam.sessions.map((s) => s.shift)))
  ).sort();

  return (
    <div className="page-shell">
      <DetailBar title={board.name} backHref="/boards" />

      <main className="mx-auto max-w-3xl px-4 py-4">
        <section className="flex items-center gap-3 rounded-xl border border-hairline bg-surface p-4">
          <BoardIcon icon={board.icon} color={board.color} image={board.image} size={48} />
          <div className="min-w-0">
            <h1 className="font-extrabold text-ink">{board.fullName}</h1>
            {board.description && (
              <p className="mt-0.5 text-xs text-ink-muted">{board.description}</p>
            )}
          </div>
        </section>

        {board.exams.length > 0 && (
          <ul className="no-scrollbar -mx-4 mt-4 flex gap-2 overflow-x-auto px-4">
            {board.exams.map((exam) => (
              <li key={exam.id} className="shrink-0">
                <Link
                  href={`/exams/${exam.slug}`}
                  className="inline-block rounded-lg border border-hairline bg-surface px-3 py-1.5 text-xs font-semibold text-ink transition hover:border-brand-300"
                >
                  {exam.name}
                </Link>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-4">
          <FeedFilters
            basePath={`/boards/${slug}`}
            exams={board.exams.map((e) => ({ value: e.slug, label: e.name }))}
            dates={dates.map((d) => ({
              value: d,
              label: examDate(new Date(`${d}T00:00:00.000Z`)),
            }))}
            shifts={shifts.map((s) => ({ value: s, label: s }))}
            current={filters}
          />
        </div>

        {/* Board header and filters paint straight away; only the list waits.
            `key` re-arms the skeleton whenever a filter changes. */}
        <div className="mt-4">
          <Suspense
            key={JSON.stringify(filters)}
            fallback={<FeedSkeleton count={5} />}
          >
            <BoardFeed slug={slug} filters={filters} />
          </Suspense>
        </div>
      </main>
    </div>
  );
}

/** The board's post list, split out so it can stream behind a skeleton. */
async function BoardFeed({
  slug,
  filters,
}: {
  slug: string;
  filters: Record<string, string | undefined>;
}) {
  const { posts } = await getFeed(
    {
      boardSlug: slug,
      examSlug: filters.exam,
      date: filters.date,
      shift: filters.shift,
      type: isPostType(filters.type) ? filters.type : undefined,
      sort: filters.sort === "top" ? "top" : "latest",
    },
    { take: 30 }
  );

  if (posts.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-hairline bg-surface p-10 text-center">
        <p className="font-semibold text-ink">No posts match these filters</p>
        <p className="mt-1 text-sm text-ink-muted">
          Try clearing a filter, or start the discussion yourself.
        </p>
        <Link
          href="/create"
          className="mt-4 inline-block rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700"
        >
          Create Post
        </Link>
      </div>
    );
  }

  return (
    <ul className="space-y-3">
      {posts.map((post) => (
        <li key={post.id}>
          <PostCard post={post} />
        </li>
      ))}
    </ul>
  );
}

function isPostType(value: string | undefined): value is PostType {
  return (
    value === "DISCUSSION" ||
    value === "POLL" ||
    value === "MEMORY_QUESTION" ||
    value === "EXPECTED_CUTOFF" ||
    value === "OFFICIAL_UPDATE" ||
    value === "OBJECTION_QUESTION"
  );
}
