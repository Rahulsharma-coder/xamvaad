import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { getBoards } from "@/lib/queries";
import { TopBar } from "@/components/TopBar";
import { BoardIcon } from "@/components/BoardIcon";

export const metadata = { title: "Boards" };

/** Board selection (PRD Part 5) — the board-first entry point. */
export default async function BoardsPage() {
  const [user, boards] = await Promise.all([getCurrentUser(), getBoards()]);

  return (
    <div className="page-shell">
      <TopBar user={user} />

      <main className="mx-auto max-w-3xl px-4 py-5">
        <h1 className="text-lg font-extrabold text-ink">Exam Boards</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Every discussion belongs to a board, so it stays findable long after
          the exam.
        </p>

        <ul className="mt-4 space-y-2.5">
          {boards.map((board) => (
            <li key={board.id}>
              <Link
                href={`/boards/${board.slug}`}
                className="flex items-center gap-3 rounded-xl border border-hairline bg-surface p-4 transition hover:border-brand-300"
              >
                <BoardIcon icon={board.icon} color={board.color} size={44} />
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-ink">{board.name}</p>
                  <p className="truncate text-xs text-ink-muted">
                    {board.fullName}
                  </p>
                  <p className="mt-0.5 text-[11px] text-ink-muted">
                    {board._count.exams} exams · {board._count.posts} posts
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}
