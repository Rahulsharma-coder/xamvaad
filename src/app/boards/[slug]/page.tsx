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
import { EmptyState } from "@/components/EmptyState";

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

        {/* Wraps rather than scrolling sideways. Every other strip in the app
            holds a fixed handful — five tabs, five lifecycle stages — so
            running off the edge costs nothing there. A board's exam list has
            no upper bound and is the main way into the board, and once
            Rajasthan Exams held six of them the ones past the fold could not
            be reached at all: the scrollbar is hidden, so on a desktop there
            was nothing to drag and no sign anything had been cut off. */}
        {board.exams.length > 0 && (
          <section className="mt-4" aria-labelledby="board-exams">
            <h2
              id="board-exams"
              className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-muted"
            >
              Exams · {board.exams.length}
            </h2>
            <ul className="flex flex-wrap gap-2">
              {board.exams.map((exam) => (
                <li key={exam.id}>
                  <Link
                    href={`/exams/${exam.slug}`}
                    className="inline-block rounded-lg border border-hairline bg-surface px-3 py-1.5 text-xs font-semibold text-ink transition hover:border-brand-300 hover:bg-brand-50/40"
                  >
                    {exam.name}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
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
    // Distinct from an empty tab: something is probably filtered out rather
    // than missing, so the first thing to suggest is widening the filter.
    return (
      <EmptyState
        title="No posts match these filters"
        body="Try clearing a filter, or start the discussion yourself."
        action={{ href: "/create", label: "Create Post" }}
      />
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
