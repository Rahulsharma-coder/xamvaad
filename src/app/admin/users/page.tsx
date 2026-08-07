import { db } from "@/lib/db";
import { requireAdminPage } from "@/lib/admin";
import { timeAgo } from "@/lib/format";
import { Badge, Card, EmptyRow, PageHeader } from "@/components/admin/ui";
import { BanButton } from "@/components/admin/BanButton";
import { Avatar } from "@/components/Avatar";
import { SearchInput } from "@/components/admin/SearchInput";

export const metadata = { title: "All Users" };
export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ q?: string }> };

const ROLE_TONE = {
  ADMIN: "done",
  MODERATOR: "live",
  BOARD_MODERATOR: "live",
  USER: "neutral",
} as const;

export default async function AdminUsersPage({ searchParams }: Props) {
  await requireAdminPage();
  const { q } = await searchParams;
  const query = q?.trim() ?? "";

  const users = await db.user.findMany({
    where: query
      ? {
          OR: [
            { name: { contains: query, mode: "insensitive" } },
            { username: { contains: query, mode: "insensitive" } },
            { email: { contains: query, mode: "insensitive" } },
          ],
        }
      : {},
    orderBy: { createdAt: "desc" },
    take: 60,
    select: {
      id: true,
      name: true,
      username: true,
      email: true,
      image: true,
      role: true,
      isBanned: true,
      createdAt: true,
      _count: { select: { posts: true, comments: true } },
    },
  });

  return (
    <>
      <PageHeader
        title="All Users"
        subtitle="Read-only for the MVP, apart from blocking."
      />

      <div className="mb-4">
        <SearchInput
          placeholder="Search by name, username or email"
          defaultValue={query}
        />
      </div>

      {users.length === 0 ? (
        <EmptyRow>No users match &ldquo;{query}&rdquo;.</EmptyRow>
      ) : (
        <ul className="space-y-2">
          {users.map((user) => (
            <li key={user.id}>
              <Card className="flex flex-wrap items-center gap-3">
                <Avatar name={user.name} image={user.image} size={36} />

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate font-semibold text-ink">
                      {user.name}
                    </p>
                    {user.role !== "USER" && (
                      <Badge tone={ROLE_TONE[user.role]}>
                        {user.role === "BOARD_MODERATOR"
                          ? "Board Mod"
                          : user.role === "MODERATOR"
                            ? "Mod"
                            : "Admin"}
                      </Badge>
                    )}
                    {user.isBanned && <Badge tone="danger">Blocked</Badge>}
                  </div>
                  <p className="truncate text-xs text-ink-muted">
                    @{user.username} · {user.email}
                  </p>
                </div>

                <div className="text-right text-[11px] text-ink-muted">
                  <p>
                    {user._count.posts} posts · {user._count.comments} comments
                  </p>
                  <p>joined {timeAgo(user.createdAt)}</p>
                </div>

                <BanButton
                  userId={user.id}
                  userName={user.name}
                  banned={user.isBanned}
                />
              </Card>
            </li>
          ))}
        </ul>
      )}

      {users.length === 60 && (
        <p className="mt-3 text-center text-xs text-ink-muted">
          Showing the 60 most recent. Use search to narrow it down.
        </p>
      )}
    </>
  );
}
