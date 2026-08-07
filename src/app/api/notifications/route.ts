import { db } from "@/lib/db";
import { handler, ok, pagination } from "@/lib/api";
import { requireUser } from "@/lib/auth";

/** GET /api/notifications — the notifications screen (wireframe 14). */
export const GET = handler(async (req: Request) => {
  const user = await requireUser();
  const url = new URL(req.url);
  const { skip, limit, page } = pagination(url, 30);

  const where = { userId: user.id };

  const [notifications, total, unread] = await Promise.all([
    db.notification.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
      select: {
        id: true,
        type: true,
        message: true,
        isRead: true,
        createdAt: true,
        postId: true,
        commentId: true,
        actor: { select: { id: true, name: true, username: true, image: true } },
      },
    }),
    db.notification.count({ where }),
    db.notification.count({ where: { ...where, isRead: false } }),
  ]);

  return ok({ notifications, total, unread, page, limit });
});

/** PATCH /api/notifications — marks all as read ("Mark all as read"). */
export const PATCH = handler(async () => {
  const user = await requireUser();
  const { count } = await db.notification.updateMany({
    where: { userId: user.id, isRead: false },
    data: { isRead: true },
  });
  return ok({ marked: count });
});
