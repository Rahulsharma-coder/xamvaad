import { db } from "@/lib/db";
import { requireAdminPage } from "@/lib/admin";
import { timeAgo, shortDate } from "@/lib/format";
import { Badge, Card, EmptyRow, PageHeader } from "@/components/admin/ui";
import { BanButton } from "@/components/admin/BanButton";
import { Avatar } from "@/components/Avatar";

export const metadata = { title: "Blocked Users" };
export const dynamic = "force-dynamic";

export default async function AdminBlockedPage() {
  await requireAdminPage();

  const blocked = await db.user.findMany({
    where: { isBanned: true },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      name: true,
      username: true,
      image: true,
      banReason: true,
      bannedUntil: true,
      updatedAt: true,
      _count: { select: { posts: true, comments: true } },
    },
  });

  return (
    <>
      <PageHeader
        title="Blocked Users"
        subtitle="Timed blocks lift themselves; permanent ones stay until removed here."
      />

      {blocked.length === 0 ? (
        <EmptyRow>Nobody is blocked.</EmptyRow>
      ) : (
        <ul className="space-y-2">
          {blocked.map((user) => (
            <li key={user.id}>
              <Card className="flex flex-wrap items-center gap-3">
                <Avatar name={user.name} image={user.image} size={40} />

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-bold text-ink">{user.name}</p>
                    {user.bannedUntil ? (
                      <Badge tone="warn">
                        Until {shortDate(user.bannedUntil)}
                      </Badge>
                    ) : (
                      <Badge tone="danger">Permanent</Badge>
                    )}
                  </div>
                  <p className="text-xs text-ink-muted">
                    @{user.username} · {user._count.posts} posts ·{" "}
                    {user._count.comments} comments
                  </p>
                  {user.banReason && (
                    <p className="mt-1 text-xs text-ink">
                      Reason: {user.banReason}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-3">
                  <span className="text-[11px] text-ink-muted">
                    {timeAgo(user.updatedAt)}
                  </span>
                  <BanButton
                    userId={user.id}
                    userName={user.name}
                    banned
                  />
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
