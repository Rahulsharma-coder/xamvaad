import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight, Flame } from "lucide-react";
import { cookies } from "next/headers";
import { getCurrentUser } from "@/lib/auth";
import { getActiveExams, getBoards } from "@/lib/queries";
import { BoardRailSkeleton, ExamListSkeleton } from "@/components/Skeletons";
import { TopBar } from "@/components/TopBar";
import { BoardIcon } from "@/components/BoardIcon";
import { EmptyState } from "@/components/EmptyState";
import { compactCount, examDate } from "@/lib/format";

/**
 * Home / Explore Exams — wireframe 03.
 *
 * Note this is exam-first, following the wireframes. The PRD described a
 * board-first homepage; boards are still here as a secondary rail, and
 * /boards/[slug] gives the board-scoped feed the PRD specified.
 */
export default async function HomePage() {
  const user = await getCurrentUser();

  // First-run visitors land on the welcome screen instead of an empty home.
  const jar = await cookies();
  if (!user && !jar.get("xamvaad_seen_welcome")) {
    redirect("/welcome");
  }

  // Both lists stream: getActiveExams() tallies discussion counts per exam and
  // is the slowest query on the landing screen.
  return (
    <div className="page-shell">
      <TopBar user={user} />

      <main className="mx-auto max-w-3xl px-4 py-5">
        <section aria-labelledby="active-exams">
          <div className="mb-3 flex items-center justify-between">
            <h1 id="active-exams" className="text-base font-bold text-ink">
              Today&apos;s Active Exams
            </h1>
            <Link
              href="/search"
              className="text-xs font-semibold text-brand-600 hover:underline"
            >
              View All
            </Link>
          </div>

          <Suspense fallback={<ExamListSkeleton />}>
            <ActiveExams />
          </Suspense>
        </section>

        <section aria-labelledby="popular-boards" className="mt-7">
          <div className="mb-3 flex items-center justify-between">
            <h2 id="popular-boards" className="text-base font-bold text-ink">
              Popular Boards
            </h2>
            <Link
              href="/boards"
              className="text-xs font-semibold text-brand-600 hover:underline"
            >
              View All
            </Link>
          </div>

          <Suspense fallback={<BoardRailSkeleton />}>
            <BoardRail />
          </Suspense>
        </section>

        {!user && (
          <section className="mt-7 rounded-xl border border-brand-200 bg-brand-50 p-4">
            <h2 className="font-bold text-brand-900">You&apos;re browsing as a guest</h2>
            <p className="mt-1 text-sm text-brand-800">
              Sign in to vote on answer keys, post questions and join discussions.
            </p>
            <Link
              href="/login"
              className="mt-3 inline-flex items-center gap-1 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700"
            >
              Sign in <ChevronRight size={16} />
            </Link>
          </section>
        )}
      </main>
    </div>
  );
}

/** "Today's Active Exams" — streams behind ExamListSkeleton. */
async function ActiveExams() {
  const exams = await getActiveExams();

  if (exams.length === 0) {
    return (
      <EmptyState
        title="No exams yet"
        body="Run `npm run db:seed` to load the demo boards and exams."
      />
    );
  }

  return (
    <ul className="space-y-2.5">
      {exams.map((exam, index) => {
        const session = exam.sessions[0];
        return (
          <li key={exam.id}>
            <Link
              href={`/exams/${exam.slug}`}
              className="flex items-center gap-3 rounded-xl border border-hairline bg-surface p-3.5 transition hover:border-brand-300 hover:shadow-sm"
            >
              <BoardIcon
                icon={exam.board.icon}
                color={exam.board.color}
                size={40}
              />

              <div className="min-w-0 flex-1">
                <p className="truncate font-bold text-ink">{exam.name}</p>
                <p className="mt-0.5 truncate text-xs text-ink-muted">
                  {session
                    ? `${examDate(session.date)} · ${session.shift}`
                    : exam.board.name}
                </p>
              </div>

              <div className="flex shrink-0 items-center gap-1.5 text-xs font-semibold text-object">
                {index < 2 && <Flame size={14} />}
                {compactCount(exam.discussing)} discussing
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/** The board rail — streams behind BoardRailSkeleton. */
async function BoardRail() {
  const boards = await getBoards();

  return (
    <ul className="no-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4 pb-1">
      {boards.map((board) => (
        <li key={board.id} className="shrink-0">
          <Link
            href={`/boards/${board.slug}`}
            className="flex w-20 flex-col items-center gap-2 text-center"
          >
            <BoardIcon icon={board.icon} color={board.color} size={48} />
            <span className="text-xs font-semibold text-ink">{board.name}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
