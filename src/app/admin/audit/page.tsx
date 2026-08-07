import { db } from "@/lib/db";
import { requireAdminPage } from "@/lib/admin";
import { timeAgo } from "@/lib/format";
import { Badge, Card, EmptyRow, PageHeader } from "@/components/admin/ui";

export const metadata = { title: "Audit Log" };
export const dynamic = "force-dynamic";

/** Every authoritative action, newest first. Read-only by design. */
export default async function AdminAuditPage() {
  await requireAdminPage();

  const entries = await db.auditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      action: true,
      targetType: true,
      summary: true,
      reason: true,
      createdAt: true,
      actor: { select: { name: true, username: true } },
    },
  });

  return (
    <>
      <PageHeader
        title="Audit Log"
        subtitle="Who did what, and why. Nothing here can be edited or deleted."
      />

      {entries.length === 0 ? (
        <EmptyRow>No admin actions recorded yet.</EmptyRow>
      ) : (
        <Card>
          <ul className="divide-y divide-hairline">
            {entries.map((entry) => (
              <li key={entry.id} className="py-3 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm text-ink">{entry.summary}</p>
                    {entry.reason && (
                      <p className="mt-0.5 text-xs text-ink-muted">
                        Reason: {entry.reason}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge>{entry.targetType}</Badge>
                    <span className="text-[11px] text-ink-muted">
                      {entry.actor?.name ?? "System"} ·{" "}
                      {timeAgo(entry.createdAt)}
                    </span>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}
