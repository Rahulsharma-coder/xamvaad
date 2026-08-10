import Link from "next/link";
import { db } from "@/lib/db";
import { requireAdminPage } from "@/lib/admin";
import { EmptyRow, PageHeader } from "@/components/admin/ui";
import { ExamOpsCard } from "@/components/admin/ExamOpsCard";

export const metadata = { title: "Exam Operations" };
export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ show?: string }> };

/** Exam Operations — the primary module, per the architecture. */
export default async function AdminExamsPage({ searchParams }: Props) {
  const scope = await requireAdminPage();
  const { show } = await searchParams;
  const showArchived = show === "archived";

  const boardFilter =
    scope.boardIds === null ? {} : { boardId: { in: scope.boardIds } };

  const exams = await db.exam.findMany({
    where: {
      ...boardFilter,
      archivedAt: showArchived ? { not: null } : null,
    },
    select: {
      id: true,
      slug: true,
      name: true,
      archivedAt: true,
      board: { select: { name: true, color: true, icon: true } },
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
      // Live posts, so the exam card agrees with the delete guards.
      _count: {
        select: { posts: { where: { deletedAt: null } }, questions: true },
      },
    },
    orderBy: [{ year: "desc" }, { createdAt: "desc" }],
  });

  return (
    <>
      <PageHeader
        title="Exam Operations"
        subtitle="Lifecycle dates drive everything aspirants see. Set them here."
        action={
          <div className="flex gap-1 rounded-lg border border-hairline bg-surface p-1">
            <Tab href="/admin/exams" active={!showArchived}>
              Active
            </Tab>
            <Tab href="/admin/exams?show=archived" active={showArchived}>
              Archived
            </Tab>
          </div>
        }
      />

      {exams.length === 0 ? (
        <EmptyRow>
          {showArchived
            ? "Nothing archived yet."
            : "No active exams for your boards."}
        </EmptyRow>
      ) : (
        <div className="grid gap-3 xl:grid-cols-2">
          {exams.map((exam) => (
            <ExamOpsCard key={exam.id} exam={exam} />
          ))}
        </div>
      )}
    </>
  );
}

function Tab({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
        active
          ? "bg-brand-600 text-white"
          : "text-ink-muted hover:bg-canvas hover:text-ink"
      }`}
    >
      {children}
    </Link>
  );
}
