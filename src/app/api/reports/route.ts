import { db } from "@/lib/db";
import { ApiError, handler, ok } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { reportSchema } from "@/lib/validation";
import { esc, notifyAdmins, siteUrl } from "@/lib/telegram";

/** POST /api/reports — "Report Post" (PRD Part 3). */
export const POST = handler(async (req: Request) => {
  const user = await requireUser();
  const input = reportSchema.parse(await req.json());

  if (!input.postId && !input.commentId) {
    throw new ApiError(400, "Tell us what you're reporting.");
  }

  // What was reported, in a few words for the admins' alert.
  let target = "";

  if (input.postId) {
    const post = await db.post.findFirst({
      where: { id: input.postId, deletedAt: null },
      select: { id: true, title: true },
    });
    if (!post) throw new ApiError(404, "That post no longer exists.");
    target = `Post: ${post.title}`;
  }

  if (input.commentId) {
    const comment = await db.comment.findFirst({
      where: { id: input.commentId, deletedAt: null },
      select: { id: true, body: true },
    });
    if (!comment) throw new ApiError(404, "That comment no longer exists.");
    target = `Comment: ${comment.body.slice(0, 120)}`;
  }

  try {
    await db.report.create({
      data: {
        reporterId: user.id,
        postId: input.postId ?? null,
        commentId: input.commentId ?? null,
        reason: input.reason,
        details: input.details,
      },
    });
  } catch (err) {
    // The unique constraint means one report per user per target.
    if (
      typeof err === "object" &&
      err !== null &&
      (err as { code?: string }).code === "P2002"
    ) {
      throw new ApiError(409, "You've already reported this.");
    }
    throw err;
  }

  await notifyAdmins(
    `🚩 <b>Nayi report</b> (${input.reason.toLowerCase().replace(/_/g, " ")})
${esc(target)}` +
      (input.details ? `

"${esc(input.details.slice(0, 300))}"` : ""),
    [[{ text: "Reports dekho", url: `${siteUrl()}/admin/reports` }]]
  );

  return ok({ success: true }, 201);
});
