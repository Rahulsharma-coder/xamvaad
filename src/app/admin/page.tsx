import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { db } from "@/lib/db";
import { requireAdminPage } from "@/lib/admin";
import { deriveStageStatus } from "@/lib/lifecycle";
import { timeAgo } from "@/lib/format";
import { Card, EmptyRow, PageHeader, Stat } from "@/components/admin/ui";
import { ExamOpsCard } from "@/components/admin/ExamOpsCard";

export const metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

/**
 * Admin home.
 *
 * Deliberately operational rather than a vanity wall: the numbers shown are
 * the ones that imply an action — reports waiting, windows closing, questions
 * still unresolved after the final key.
 */
export default async function AdminDashboard() {
  const scope = await requireAdminPage();
  const boardFilter =
    scope.boardIds === null ? {} : { boardId: { in: scope.boardIds } };

  const [openReports, liveExams, bannedUsers, totalUsers, recentAudit] =
    await Promise.all([
      db.report.count({ where: { status: "OPEN" } }),
      db.exam.findMany({
        where: { archivedAt: null, ...boardFilter },
        select: {
          id: true,
          slug: true,
          name: true,
          board: { select: { name: true, color: true, icon: true, image: true } },
          phases: {
            select: {
              id: true,
              slug: true,
              name: true,
              kind: true,
              sequence: true,
              sessions: { select: { id: true } },
              stages: {
                select: {
                  stage: true,
                  statusOverride: true,
                  startsAt: true,
                  endsAt: true,
                },
                orderBy: { sortOrder: "asc" },
              },
            },
            orderBy: { sequence: "asc" },
          },
          // Live posts, so the exam card here reads the same as the one on
          // Exam Operations and as the delete guards.
          _count: {
            select: { posts: { where: { deletedAt: null } }, questions: true },
          },
        },
        orderBy: { createdAt: "desc" },
        take: 12,
      }),
      db.user.count({ where: { isBanned: true } }),
      db.user.count(),
      db.auditLog.findMany({
        orderBy: { createdAt: "desc" },
        take: 6,
        select: {
          id: true,
          summary: true,
          createdAt: true,
          actor: { select: { name: true } },
        },
      }),
    ]);

  // An exam needs attention when its objection window is open (aspirants are
  // filing right now) or when the final key is due.
  const needsAttention = liveExams.filter((exam) =>
    exam.phases.some((phase) => {
      const window = phase.stages.find((s) => s.stage === "OBJECTION_WINDOW");
      return window && deriveStageStatus(window) === "ACTIVE";
    })
  );

  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle="What needs a decision today."
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="Reports waiting"
          value={openReports}
          hint={openReports ? "Needs review" : "All clear"}
          tone={openReports > 0 ? "danger" : "good"}
          href="/admin/reports"
        />
        <Stat
          label="Objection windows open"
          value={needsAttention.length}
          hint="Aspirants filing now"
          tone={needsAttention.length ? "warn" : "default"}
          href="/admin/exams"
        />
        <Stat
          label="Blocked users"
          value={bannedUsers}
          href="/admin/blocked"
        />
        <Stat label="Registered users" value={totalUsers} href="/admin/users" />
      </div>

      <section className="mt-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-bold text-ink">Exam Operations</h2>
          <Link
            href="/admin/exams"
            className="inline-flex items-center gap-1 text-xs font-semibold text-brand-600 hover:underline"
          >
            View all <ArrowRight size={13} />
          </Link>
        </div>

        {liveExams.length === 0 ? (
          <EmptyRow>
            No active exams.{" "}
            <Link href="/admin/boards" className="font-semibold text-brand-600">
              Create one
            </Link>{" "}
            to get started.
          </EmptyRow>
        ) : (
          <div className="grid gap-3 xl:grid-cols-2">
            {liveExams.slice(0, 4).map((exam) => (
              <ExamOpsCard key={exam.id} exam={exam} />
            ))}
          </div>
        )}
      </section>

      <section className="mt-6">
        <h2 className="mb-3 text-base font-bold text-ink">Recent admin activity</h2>
        <Card>
          {recentAudit.length === 0 ? (
            <p className="py-4 text-center text-sm text-ink-muted">
              Nothing logged yet.
            </p>
          ) : (
            <ul className="divide-y divide-hairline">
              {recentAudit.map((entry) => (
                <li
                  key={entry.id}
                  className="flex items-start justify-between gap-3 py-2.5 first:pt-0 last:pb-0"
                >
                  <p className="min-w-0 text-sm text-ink">{entry.summary}</p>
                  <span className="shrink-0 text-[11px] text-ink-muted">
                    {entry.actor?.name ?? "System"} · {timeAgo(entry.createdAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>
    </>
  );
}
