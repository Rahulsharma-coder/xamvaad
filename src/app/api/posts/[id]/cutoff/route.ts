import { db } from "@/lib/db";
import { ApiError, handler, ok } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { cutoffEstimateSchema } from "@/lib/validation";
import { summariseCutoffPost } from "@/lib/cutoff";

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST /api/posts/:id/cutoff — add or update the reader's own prediction.
 *
 * One estimate per user per post, so re-submitting replaces the previous
 * figure rather than stacking another vote onto the median.
 */
export const POST = handler(async (req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const user = await requireUser();
  const { category, marks } = cutoffEstimateSchema.parse(await req.json());

  const post = await db.post.findFirst({
    where: { id, deletedAt: null, status: "ACTIVE" },
    select: { id: true, type: true },
  });
  if (!post) throw new ApiError(404, "That post no longer exists.");
  if (post.type !== "EXPECTED_CUTOFF") {
    throw new ApiError(400, "This post isn't a cutoff prediction.");
  }

  await db.cutoffEstimate.upsert({
    where: { postId_userId: { postId: id, userId: user.id } },
    create: { postId: id, userId: user.id, category, marks },
    update: { category, marks },
  });

  return ok(await summariseCutoffPost(id, user.id));
});
