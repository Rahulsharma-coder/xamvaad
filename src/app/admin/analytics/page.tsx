import { db } from "@/lib/db";
import { requireAdminPage } from "@/lib/admin";
import { objectionPercent } from "@/lib/rules";
import { Card, EmptyRow, PageHeader, Stat } from "@/components/admin/ui";

export const metadata = { title: "Analytics" };
export const dynamic = "force-dynamic";

/**
 * Analytics — read-only for the MVP, and deliberately operational.
 *
 * Numbers chosen because they imply an action: a growing report queue means
 * moderation is behind, an unresolved question count means a final key is
 * overdue. Vanity totals are left out.
 */
export default async function AdminAnalyticsPage() {
  const scope = await requireAdminPage();
  const boardFilter =
    scope.boardIds === null ? {} : { boardId: { in: scope.boardIds } };

  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [
    postsToday,
    postsWeek,
    commentsToday,
    newUsersWeek,
    openReports,
    unresolvedQuestions,
    topExams,
    mostChallenged,
  ] = await Promise.all([
    db.post.count({ where: { createdAt: { gte: dayAgo }, deletedAt: null, ...boardFilter } }),
    db.post.count({ where: { createdAt: { gte: weekAgo }, deletedAt: null, ...boardFilter } }),
    db.comment.count({ where: { createdAt: { gte: dayAgo }, deletedAt: null } }),
    db.user.count({ where: { createdAt: { gte: weekAgo } } }),
    db.report.count({ where: { status: "OPEN" } }),
    db.question.count({ where: { isResolved: false } }),
    db.exam.findMany({
      where: { archivedAt: null, ...boardFilter },
      select: {
        id: true,
        name: true,
        _count: { select: { posts: true, questions: true } },
      },
      orderBy: { posts: { _count: "desc" } },
      take: 6,
    }),
    db.question.findMany({
      where: { isResolved: false, objectVotes: { gt: 0 } },
      select: {
        id: true,
        number: true,
        objectVotes: true,
        correctVotes: true,
        officialAnswer: true,
        exam: { select: { name: true, slug: true } },
      },
      orderBy: { objectVotes: "desc" },
      take: 8,
    }),
  ]);

  return (
    <>
      <PageHeader
        title="Analytics"
        subtitle="Operational numbers — the ones worth acting on."
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Posts today" value={postsToday} hint={`${postsWeek} this week`} />
        <Stat label="Comments today" value={commentsToday} />
        <Stat label="New users this week" value={newUsersWeek} />
        <Stat
          label="Reports waiting"
          value={openReports}
          tone={openReports > 0 ? "danger" : "good"}
          href="/admin/reports"
        />
      </div>

      <section className="mt-6 grid gap-4 lg:grid-cols-2">
        <div>
          <h2 className="mb-3 text-base font-bold text-ink">Busiest exams</h2>
          <Card>
            {topExams.length === 0 ? (
              <p className="py-3 text-center text-sm text-ink-muted">
                No exams yet.
              </p>
            ) : (
              <ul className="divide-y divide-hairline">
                {topExams.map((exam) => (
                  <li
                    key={exam.id}
                    className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0"
                  >
                    <span className="min-w-0 truncate text-sm text-ink">
                      {exam.name}
                    </span>
                    <span className="shrink-0 text-xs text-ink-muted">
                      {exam._count.posts} posts · {exam._count.questions} qs
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div>
          <h2 className="mb-1 text-base font-bold text-ink">
            Most challenged questions
          </h2>
          <p className="mb-3 text-xs text-ink-muted">
            {unresolvedQuestions} unresolved overall — these await a final key.
          </p>
          <Card>
            {mostChallenged.length === 0 ? (
              <EmptyRow>No objections raised yet.</EmptyRow>
            ) : (
              <ul className="divide-y divide-hairline">
                {mostChallenged.map((q) => {
                  const percent = objectionPercent(q.objectVotes, q.correctVotes);
                  return (
                    <li
                      key={q.id}
                      className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-ink">
                          Q{q.number}
                          {q.officialAnswer && (
                            <span className="ml-1.5 font-normal text-ink-muted">
                              key: {q.officialAnswer}
                            </span>
                          )}
                        </p>
                        <p className="truncate text-[11px] text-ink-muted">
                          {q.exam.name}
                        </p>
                      </div>
                      <span
                        className={`shrink-0 text-sm font-bold tabular-nums ${
                          percent >= 70 ? "text-object" : "text-amber-600"
                        }`}
                      >
                        {percent}%
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>
      </section>
    </>
  );
}
