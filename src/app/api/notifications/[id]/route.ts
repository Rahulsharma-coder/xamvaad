import { db } from "@/lib/db";
import { handler, ok } from "@/lib/api";
import { requireUser } from "@/lib/auth";

type Ctx = { params: Promise<{ id: string }> };

/**
 * PATCH /api/notifications/:id — marks one notification read.
 *
 * Scoped by userId rather than looked up first: a wrong id simply matches
 * nothing, so there is no way to probe for another account's notifications or
 * to clear their badge. Already-read rows match nothing either, which keeps a
 * second click from writing.
 */
export const PATCH = handler(async (_req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const user = await requireUser();

  const { count } = await db.notification.updateMany({
    where: { id, userId: user.id, isRead: false },
    data: { isRead: true },
  });

  return ok({ marked: count });
});
