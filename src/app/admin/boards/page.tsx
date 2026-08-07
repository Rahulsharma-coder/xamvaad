import Link from "next/link";
import { db } from "@/lib/db";
import { requireAdminPage, isAdmin } from "@/lib/admin";
import { Badge, Card, EmptyRow, PageHeader } from "@/components/admin/ui";
import { BoardIcon } from "@/components/BoardIcon";
import { NewBoardForm, NewExamForm } from "@/components/admin/BoardExamForms";
import { redirect } from "next/navigation";

export const metadata = { title: "Boards & Exams" };
export const dynamic = "force-dynamic";

/** Content & Taxonomy — the structure everything else hangs off. */
export default async function AdminBoardsPage() {
  const scope = await requireAdminPage();
  // Creating boards and exams reshapes the whole platform, so it is full-admin
  // only. Board moderators run the exams they already have.
  if (!isAdmin(scope.user)) redirect("/admin/exams");

  const boards = await db.board.findMany({
    orderBy: { sortOrder: "asc" },
    select: {
      id: true,
      slug: true,
      name: true,
      fullName: true,
      icon: true,
      color: true,
      isActive: true,
      exams: {
        select: {
          id: true,
          slug: true,
          name: true,
          year: true,
          archivedAt: true,
          _count: { select: { posts: true, sessions: true } },
        },
        orderBy: { year: "desc" },
      },
    },
  });

  return (
    <>
      <PageHeader
        title="Boards & Exams"
        subtitle="The hierarchy every post is filed under."
        action={
          <div className="flex flex-wrap gap-2">
            <NewExamForm boards={boards.map((b) => ({ id: b.id, name: b.name }))} />
            <NewBoardForm />
          </div>
        }
      />

      {boards.length === 0 ? (
        <EmptyRow>No boards yet. Create one to get started.</EmptyRow>
      ) : (
        <div className="space-y-3">
          {boards.map((board) => (
            <Card key={board.id}>
              <div className="flex items-center gap-3">
                <BoardIcon icon={board.icon} color={board.color} size={36} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h2 className="font-bold text-ink">{board.name}</h2>
                    {!board.isActive && <Badge tone="warn">Hidden</Badge>}
                  </div>
                  <p className="truncate text-xs text-ink-muted">
                    {board.fullName}
                  </p>
                </div>
                <span className="shrink-0 text-xs text-ink-muted">
                  {board.exams.length} exams
                </span>
              </div>

              {board.exams.length > 0 && (
                <ul className="mt-3 divide-y divide-hairline border-t border-hairline">
                  {board.exams.map((exam) => (
                    <li
                      key={exam.id}
                      className="flex flex-wrap items-center justify-between gap-2 py-2.5"
                    >
                      <div className="min-w-0">
                        <Link
                          href={`/admin/exams/${exam.slug}`}
                          className="text-sm font-semibold text-ink hover:text-brand-600 hover:underline"
                        >
                          {exam.name}
                        </Link>
                        {exam.archivedAt && (
                          <Badge tone="neutral">Archived</Badge>
                        )}
                      </div>
                      <span className="text-[11px] text-ink-muted">
                        {exam._count.sessions} shifts · {exam._count.posts} posts
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
