import { db } from "@/lib/db";
import { ApiError, handler, ok } from "@/lib/api";
import { requireAdminApi } from "@/lib/admin";
import { audit } from "@/lib/audit";
import { moderateReportSchema } from "@/lib/adminValidation";

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST /api/admin/reports/:id — action a report.
 *
 * HIDE is the default tool rather than REMOVE: it is reversible, and
 * moderators misjudge things. REMOVE is still a soft delete, so the row
 * survives for the audit trail.
 *
 * A reason is required for anything that touches the content, and it is stored
 * on the post so the author can be told why. Silent removal is what makes a
 * community feel arbitrary — "Trust Over Noise" is a stated principle.
 */
export const POST = handler(async (req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const scope = await requireAdminApi();
  const input = moderateReportSchema.parse(await req.json());

  const report = await db.report.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      postId: true,
      commentId: true,
      post: { select: { id: true, title: true, boardId: true } },
      comment: { select: { id: true, postId: true } },
    },
  });
  if (!report) throw new ApiError(404, "That report no longer exists.");

  if (input.action !== "DISMISS" && !input.reason) {
    throw new ApiError(400, "Give a reason — the author is shown it.");
  }

  const now = new Date();
  let summary = "";

  if (input.action === "DISMISS") {
    summary = "Dismissed report";
  } else if (report.postId && report.post) {
    if (input.action === "RESTORE") {
      await db.post.update({
        where: { id: report.postId },
        data: {
          status: "ACTIVE",
          deletedAt: null,
          moderationReason: null,
          moderatedById: scope.user.id,
          moderatedAt: now,
        },
      });
      summary = `Restored post "${report.post.title}"`;
    } else {
      const removing = input.action === "REMOVE";
      await db.post.update({
        where: { id: report.postId },
        data: {
          status: removing ? "REMOVED" : "HIDDEN",
          deletedAt: removing ? now : null,
          moderationReason: input.reason,
          moderatedById: scope.user.id,
          moderatedAt: now,
        },
      });
      summary = `${removing ? "Removed" : "Hid"} post "${report.post.title}"`;
    }
  } else if (report.commentId && report.comment) {
    if (input.action === "RESTORE") {
      await db.$transaction([
        db.comment.update({
          where: { id: report.commentId },
          data: { deletedAt: null },
        }),
        db.post.update({
          where: { id: report.comment.postId },
          data: { commentCount: { increment: 1 } },
        }),
      ]);
      summary = "Restored comment";
    } else {
      await db.$transaction([
        db.comment.update({
          where: { id: report.commentId },
          data: { deletedAt: now },
        }),
        db.post.update({
          where: { id: report.comment.postId },
          data: { commentCount: { decrement: 1 } },
        }),
      ]);
      summary = "Removed comment";
    }
  }

  await db.report.update({
    where: { id },
    data: {
      status: input.action === "DISMISS" ? "DISMISSED" : "ACTIONED",
      resolvedById: scope.user.id,
      resolvedAt: now,
    },
  });

  // Tell the author what happened and why.
  if (input.action === "HIDE" || input.action === "REMOVE") {
    const authorId = report.postId
      ? (
          await db.post.findUnique({
            where: { id: report.postId },
            select: { authorId: true },
          })
        )?.authorId
      : (
          await db.comment.findUnique({
            where: { id: report.commentId! },
            select: { authorId: true },
          })
        )?.authorId;

    if (authorId) {
      await db.notification.create({
        data: {
          userId: authorId,
          type: "MODERATION",
          message: `A moderator ${
            input.action === "REMOVE" ? "removed" : "hid"
          } your ${report.postId ? "post" : "comment"}: ${input.reason}`,
          postId: report.postId ?? report.comment?.postId ?? null,
        },
      });
    }
  }

  await audit({
    actor: scope.user,
    action: `report.${input.action.toLowerCase()}`,
    targetType: "Report",
    targetId: id,
    summary,
    reason: input.reason ?? null,
  });

  return ok({ success: true });
});
