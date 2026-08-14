import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { timeAgo } from "@/lib/format";
import { Avatar } from "@/components/Avatar";
import { MarkAllRead } from "@/components/MarkAllRead";
import { NotificationRow } from "@/components/NotificationRow";

export const metadata = { title: "Notifications" };

/** Notifications — wireframe 14. */
export default async function NotificationsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/notifications");

  const notifications = await db.notification.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      type: true,
      message: true,
      isRead: true,
      createdAt: true,
      postId: true,
      actor: { select: { name: true, image: true } },
    },
  });

  const unread = notifications.filter((n) => !n.isRead).length;

  return (
    <div className="page-shell">
      <header className="sticky top-0 z-30 border-b border-hairline bg-surface/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
          <h1 className="text-base font-bold text-ink">Notifications</h1>
          {unread > 0 && <MarkAllRead />}
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-4">
        {notifications.length === 0 ? (
          <div className="rounded-xl border border-dashed border-hairline bg-surface p-10 text-center">
            <p className="font-semibold text-ink">You&apos;re all caught up</p>
            <p className="mt-1 text-sm text-ink-muted">
              Replies, likes and official updates will show up here.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-hairline overflow-hidden rounded-xl border border-hairline bg-surface">
            {notifications.map((notification) => (
              <li key={notification.id}>
                <NotificationRow
                  id={notification.id}
                  isRead={notification.isRead}
                  href={
                    notification.postId
                      ? `/posts/${notification.postId}`
                      : null
                  }
                >
                  {notification.actor ? (
                    <Avatar
                      name={notification.actor.name}
                      image={notification.actor.image}
                      size={34}
                    />
                  ) : (
                    <span className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full bg-brand-50 text-xs font-bold text-brand-700">
                      X
                    </span>
                  )}

                  <div className="min-w-0 flex-1">
                    <p className="text-sm leading-snug text-ink">
                      {notification.message}
                    </p>
                    <p className="mt-0.5 text-xs text-ink-muted">
                      {timeAgo(notification.createdAt)}
                    </p>
                  </div>
                </NotificationRow>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
