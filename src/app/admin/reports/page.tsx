import Link from "next/link";
import { db } from "@/lib/db";
import { requireAdminPage } from "@/lib/admin";
import { timeAgo } from "@/lib/format";
import { Badge, Card, EmptyRow, PageHeader } from "@/components/admin/ui";
import { ReportActions } from "@/components/admin/ReportActions";
import { BanButton } from "@/components/admin/BanButton";

export const metadata = { title: "Reports" };
export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ status?: string }> };

const REASON_LABEL: Record<string, string> = {
  SPAM: "Spam",
  DUPLICATE: "Duplicate",
  MISINFORMATION: "Misinformation",
  ABUSE: "Abuse",
  OFF_TOPIC: "Off topic",
  OTHER: "Other",
};

/** Reports — posts *and* comments, since both can be reported. */
export default async function AdminReportsPage({ searchParams }: Props) {
  await requireAdminPage();
  const { status } = await searchParams;
  const showResolved = status === "resolved";

  const reports = await db.report.findMany({
    where: showResolved
      ? { status: { in: ["ACTIONED", "DISMISSED"] } }
      : { status: { in: ["OPEN", "REVIEWING"] } },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      reason: true,
      details: true,
      status: true,
      createdAt: true,
      reporter: { select: { name: true, username: true } },
      post: {
        select: {
          id: true,
          title: true,
          body: true,
          status: true,
          author: { select: { id: true, name: true, username: true, isBanned: true } },
          exam: { select: { name: true } },
        },
      },
      comment: {
        select: {
          id: true,
          body: true,
          postId: true,
          deletedAt: true,
          author: { select: { id: true, name: true, username: true, isBanned: true } },
        },
      },
    },
  });

  return (
    <>
      <PageHeader
        title="Reports"
        subtitle="Posts and comments flagged by the community."
        action={
          <div className="flex gap-1 rounded-lg border border-hairline bg-surface p-1">
            <Tab href="/admin/reports" active={!showResolved}>
              Open
            </Tab>
            <Tab href="/admin/reports?status=resolved" active={showResolved}>
              Resolved
            </Tab>
          </div>
        }
      />

      {reports.length === 0 ? (
        <EmptyRow>
          {showResolved ? "Nothing resolved yet." : "No open reports. All clear."}
        </EmptyRow>
      ) : (
        <ul className="space-y-3">
          {reports.map((report) => {
            const target = report.post ?? report.comment;
            const author = report.post?.author ?? report.comment?.author;
            const isPost = Boolean(report.post);
            const removed = report.post
              ? report.post.status !== "ACTIVE"
              : Boolean(report.comment?.deletedAt);

            return (
              <li key={report.id}>
                <Card>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone="danger">{REASON_LABEL[report.reason]}</Badge>
                    <Badge>{isPost ? "Post" : "Comment"}</Badge>
                    {removed && <Badge tone="warn">Already actioned</Badge>}
                    <span className="ml-auto text-[11px] text-ink-muted">
                      reported by @{report.reporter.username} ·{" "}
                      {timeAgo(report.createdAt)}
                    </span>
                  </div>

                  {!target ? (
                    <p className="mt-3 text-sm italic text-ink-muted">
                      The reported content has since been deleted.
                    </p>
                  ) : (
                    <div className="mt-3">
                      {report.post && (
                        <Link
                          href={`/posts/${report.post.id}`}
                          className="font-bold text-ink hover:underline"
                        >
                          {report.post.title}
                        </Link>
                      )}
                      <p className="mt-1 line-clamp-3 whitespace-pre-line text-sm text-ink-muted">
                        {report.post?.body ?? report.comment?.body}
                      </p>
                      <p className="mt-1.5 text-[11px] text-ink-muted">
                        by {author?.name} (@{author?.username})
                        {report.post?.exam && ` · ${report.post.exam.name}`}
                      </p>
                    </div>
                  )}

                  {report.details && (
                    <p className="mt-2 rounded-lg bg-canvas p-2 text-xs text-ink-muted">
                      &ldquo;{report.details}&rdquo;
                    </p>
                  )}

                  {!showResolved && (
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-hairline pt-3">
                      <ReportActions reportId={report.id} />
                      {author && !author.isBanned && (
                        <BanButton
                          userId={author.id}
                          userName={author.name}
                          banned={false}
                        />
                      )}
                    </div>
                  )}
                </Card>
              </li>
            );
          })}
        </ul>
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
