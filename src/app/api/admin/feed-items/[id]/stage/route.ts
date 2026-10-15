import { z } from "zod";
import { db } from "@/lib/db";
import { ApiError, handler, ok } from "@/lib/api";
import { assertBoardAllowed, requireAdminApi } from "@/lib/admin";
import { audit } from "@/lib/audit";
import { markStageFromFeed } from "@/lib/officialFeed";
import { STAGE_LABEL } from "@/lib/lifecycle";

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

  const item = await db.feedItem.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      stage: true,
      publishedAt: true,
      createdAt: true,
      exam: { select: { id: true, name: true, boardId: true } },
    },
  });
  if (!item?.stage || !item.exam) {
    throw new ApiError(404, "That feed update has no stage to mark.");
  }
  assertBoardAllowed(scope, item.exam.boardId);

  const phase = await db.examPhase.findFirst({
    where: { id: phaseId, examId: item.exam.id },
    select: { id: true },
  });
  if (!phase) throw new ApiError(400, "That phase doesn't belong to this exam.");

  const result = await markStageFromFeed(
    phase.id,
    item.stage,
    item.publishedAt ?? item.createdAt
  );

  await db.feedItem.update({
    where: { id },
    data: { stagePhaseId: phase.id, stageNote: result.note },
  });

  await audit({
    actor: scope.user,
    action: "exam.stage.update",
    targetType: "Exam",
    targetId: item.exam.id,
    summary: result.marked
      ? `Marked ${STAGE_LABEL[item.stage]} for ${item.exam.name} ${result.phaseName} from the feed update "${item.title}"`
      : `Left ${STAGE_LABEL[item.stage]} for ${item.exam.name} ${result.phaseName} as already set`,
  });

  return ok({ note: result.note });
});
