import { db } from "@/lib/db";
import { ApiError, handler, ok } from "@/lib/api";
import { requireAdminApi } from "@/lib/admin";
import { audit } from "@/lib/audit";
import { banUserSchema } from "@/lib/adminValidation";

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST /api/admin/users/:id/ban — suspend an account.
 *
 * Temporary by default: `days` sets an expiry and null means permanent. A
 * first offence rarely deserves a life sentence, and a lapsing ban needs no
 * follow-up from anyone.
 *
 * Hiding their existing content is a separate, explicit choice — a spammer's
 * posts should go, but someone suspended for one bad argument shouldn't lose
 * every helpful answer they ever wrote.
 */
export const POST = handler(async (req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const scope = await requireAdminApi();
  const input = banUserSchema.parse(await req.json());

  const target = await db.user.findUnique({
    where: { id },
    select: { id: true, name: true, email: true, role: true, isBanned: true },
  });
  if (!target) throw new ApiError(404, "That account no longer exists.");

  if (target.id === scope.user.id) {
    throw new ApiError(400, "You can't ban yourself.");
  }
  // Only a full admin may act on other staff.
  if (target.role !== "USER" && scope.user.role !== "ADMIN") {
    throw new ApiError(403, "Only an administrator can ban another moderator.");
  }

  const bannedUntil = input.days
    ? new Date(Date.now() + input.days * 24 * 60 * 60 * 1000)
    : null;

  await db.user.update({
    where: { id },
    data: {
      isBanned: true,
      bannedUntil,
      banReason: input.reason,
      bannedById: scope.user.id,
    },
  });

  let hidden = 0;
  if (input.hideContent) {
    const result = await db.post.updateMany({
      where: { authorId: id, status: "ACTIVE", deletedAt: null },
      data: {
        status: "HIDDEN",
        moderationReason: `Author suspended: ${input.reason}`,
        moderatedById: scope.user.id,
        moderatedAt: new Date(),
      },
    });
    hidden = result.count;
  }

  await audit({
    actor: scope.user,
    action: "user.ban",
    targetType: "User",
    targetId: id,
    summary: `Banned ${target.name} (${target.email}) ${
      input.days ? `for ${input.days} days` : "permanently"
    }${hidden ? `, hid ${hidden} posts` : ""}`,
    reason: input.reason,
    metadata: { days: input.days, hideContent: Boolean(input.hideContent) },
  });

  return ok({ banned: true, bannedUntil, hidden });
});

/** DELETE /api/admin/users/:id/ban — lift a suspension. */
export const DELETE = handler(async (_req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const scope = await requireAdminApi();

  const target = await db.user.findUnique({
    where: { id },
    select: { id: true, name: true, email: true, isBanned: true },
  });
  if (!target) throw new ApiError(404, "That account no longer exists.");

  await db.user.update({
    where: { id },
    data: {
      isBanned: false,
      bannedUntil: null,
      banReason: null,
      bannedById: null,
    },
  });

  await audit({
    actor: scope.user,
    action: "user.unban",
    targetType: "User",
    targetId: id,
    summary: `Unbanned ${target.name} (${target.email})`,
  });

  return ok({ banned: false });
});
