import { z } from "zod";
import { ApiError, handler, ok } from "@/lib/api";
import { requireAdminApi, scopeAllowsBoard } from "@/lib/admin";
import { FeedStageError, resolveFeedItemStage } from "@/lib/officialFeed";

type Ctx = { params: Promise<{ id: string }> };

const schema = z.object({ phaseId: z.string().min(1, "Choose a phase") });

/**
 * POST /api/admin/feed-items/:id/stage — finish a feed update's stage.
 *
 * For an update the job published but could not place on a phase ("CGL
 * Result" on an exam with three tiers): the admin names the phase and the
 * stage is marked exactly as the job would have marked it.
 */
export const POST = handler(async (req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const scope = await requireAdminApi();
  const { phaseId } = schema.parse(await req.json());

  try {
    return ok(
      await resolveFeedItemStage({
        itemId: id,
        phaseId,
        actor: scope.user,
        allowBoard: (boardId) => scopeAllowsBoard(scope, boardId),
      })
    );
  } catch (err) {
    if (err instanceof FeedStageError) throw new ApiError(err.status, err.message);
    throw err;
  }
});
