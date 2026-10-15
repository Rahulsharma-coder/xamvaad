import Link from "next/link";
import type { FeedItemStatus } from "@/prisma/client";
import { db } from "@/lib/db";
import { requireAdminPage } from "@/lib/admin";
import { timeAgo } from "@/lib/format";
import { Badge, Card, EmptyRow, PageHeader } from "@/components/admin/ui";
import { PublishUpdateForm } from "@/components/admin/PublishUpdateForm";
import { FeedAlert } from "@/components/admin/FeedAlert";
import { FeedStageButtons } from "@/components/admin/FeedStageButtons";
import { STAGE_LABEL } from "@/lib/lifecycle";
import { phasesWithStage } from "@/lib/officialFeed";

export const metadata = { title: "Official Updates" };
export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ exam?: string }> };

const FEED_STATUS: Record<
  FeedItemStatus,
  { label: string; tone: "neutral" | "live" | "warn" | "danger" | "done" }
> = {
  PUBLISHED: { label: "Published", tone: "live" },
  PROCESSING: { label: "In progress", tone: "neutral" },
  NO_EXAM_MATCH: { label: "Not our exam", tone: "neutral" },
  AMBIGUOUS: { label: "Matched two exams", tone: "warn" },
  OTHER_YEAR: { label: "Another cycle", tone: "neutral" },
  UNKNOWN_TYPE: { label: "Type not posted", tone: "warn" },
  NO_OFFICIAL_LINK: { label: "No government link", tone: "warn" },
  FAILED: { label: "Failed, retrying", tone: "danger" },
};

export default async function AdminUpdatesPage({ searchParams }: Props) {
  const scope = await requireAdminPage();
  const { exam: examSlug } = await searchParams;
  const boardFilter =
    scope.boardIds === null ? {} : { boardId: { in: scope.boardIds } };

  const [exams, published, feedItems] = await Promise.all([
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
    // Entries about our exams, and failures. Everything else in the feed is
    // another board's news and would bury these.
    db.feedItem.findMany({
      where: {
        status: { not: "NO_EXAM_MATCH" },
        ...(scope.boardIds === null
          ? {}
          : { exam: { boardId: { in: scope.boardIds } } }),
      },
      orderBy: { createdAt: "desc" },
      take: 15,
      select: {
        id: true,
        title: true,
        status: true,
        sourceUrl: true,
        officialUrl: true,
        postId: true,
        stage: true,
        stagePhaseId: true,
        stageNote: true,
        createdAt: true,
        exam: {
          select: {
            name: true,
            phases: {
              select: { id: true, name: true, kind: true },
              orderBy: { sequence: "asc" },
            },
          },
        },
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

      <FeedAlert />

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

      <section className="mt-6">
        <h2 className="text-sm font-bold text-ink">Sarkari Result feed</h2>
        <p className="mb-3 mt-0.5 text-xs text-ink-muted">
          Checked every hour. Entries about our exams are posted in Hindi
          with the board&apos;s own link, and an answer key, final key or
          result also marks that stage on the exam&apos;s lifecycle. The ones
          skipped here may need a manual update. Matching uses each exam&apos;s keywords, set on its
          Exam Operations page.
        </p>
        {feedItems.length === 0 ? (
          <EmptyRow>
            No feed entry has matched one of our exams yet.
          </EmptyRow>
        ) : (
          <ul className="space-y-2">
            {feedItems.map((item) => {
              const status = FEED_STATUS[item.status];
              return (
                <li
                  key={item.id}
                  className="rounded-xl border border-hairline bg-surface p-3"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={status.tone}>{status.label}</Badge>
                    <span className="text-[11px] text-ink-muted">
                      {item.exam?.name ?? "No exam"} · {timeAgo(item.createdAt)}
                    </span>
                  </div>
                  <p className="mt-1.5 text-sm font-semibold text-ink">
                    {item.title}
                  </p>
                  <p className="mt-1 flex flex-wrap gap-3 text-[11px] font-semibold">
                    <a
                      href={item.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-ink-muted hover:text-ink"
                    >
                      Feed entry
                    </a>
                    {item.officialUrl && (
                      <a
                        href={item.officialUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-ink-muted hover:text-ink"
                      >
                        Official link
                      </a>
                    )}
                    {item.postId && (
                      <Link
                        href={`/posts/${item.postId}`}
                        className="text-brand-700 hover:underline"
                      >
                        View post
                      </Link>
                    )}
                  </p>
                  {item.stageNote && (
                    <p className="mt-1.5 text-[11px] text-ink-muted">
                      {item.stageNote}
                    </p>
                  )}
                  {item.stage && !item.stagePhaseId && item.exam && (
                    <FeedStageButtons
                      itemId={item.id}
                      stageLabel={STAGE_LABEL[item.stage]}
                      phases={phasesWithStage(item.exam.phases, item.stage)}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}
