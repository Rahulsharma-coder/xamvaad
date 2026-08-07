import Link from "next/link";
import { db } from "@/lib/db";
import { requireAdminPage } from "@/lib/admin";
import { timeAgo } from "@/lib/format";
import { Card, EmptyRow, PageHeader } from "@/components/admin/ui";
import { PublishUpdateForm } from "@/components/admin/PublishUpdateForm";

export const metadata = { title: "Official Updates" };
export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ exam?: string }> };

export default async function AdminUpdatesPage({ searchParams }: Props) {
  const scope = await requireAdminPage();
  const { exam: examSlug } = await searchParams;
  const boardFilter =
    scope.boardIds === null ? {} : { boardId: { in: scope.boardIds } };

  const [exams, published] = await Promise.all([
    db.exam.findMany({
      where: { archivedAt: null, ...boardFilter },
      orderBy: [{ year: "desc" }, { name: "asc" }],
      select: { id: true, slug: true, name: true },
    }),
    db.post.findMany({
      where: { type: "OFFICIAL_UPDATE", deletedAt: null, ...boardFilter },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        title: true,
        createdAt: true,
        exam: { select: { name: true } },
        author: { select: { name: true } },
      },
    }),
  ]);

  const defaultExamId = examSlug
    ? exams.find((e) => e.slug === examSlug)?.id
    : undefined;

  return (
    <>
      <PageHeader
        title="Official Updates"
        subtitle="Pinned announcements, delivered to everyone active in the exam."
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Card>
          <PublishUpdateForm
            exams={exams.map((e) => ({ id: e.id, name: e.name }))}
            defaultExamId={defaultExamId}
          />
        </Card>

        <div>
          <h2 className="mb-3 text-sm font-bold text-ink">Recently published</h2>
          {published.length === 0 ? (
            <EmptyRow>Nothing published yet.</EmptyRow>
          ) : (
            <ul className="space-y-2">
              {published.map((post) => (
                <li key={post.id}>
                  <Link
                    href={`/posts/${post.id}`}
                    className="block rounded-xl border border-hairline bg-surface p-3 transition hover:border-brand-300"
                  >
                    <p className="text-sm font-semibold text-ink">
                      {post.title}
                    </p>
                    <p className="mt-1 text-[11px] text-ink-muted">
                      {post.exam.name} · {post.author.name} ·{" "}
                      {timeAgo(post.createdAt)}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </>
  );
}
