import { db } from "@/lib/db";
import { ApiError, handler, ok } from "@/lib/api";
import { assertBoardAllowed, requireAdminApi } from "@/lib/admin";
import { audit } from "@/lib/audit";
import {
  parseDay,
  toDayInput,
  updateStagesSchema,
} from "@/lib/adminValidation";
import { runDueAnnouncements, suppressPastAnnouncements } from "@/lib/announce";
import { STAGE_LABEL } from "@/lib/lifecycle";

type Ctx = { params: Promise<{ id: string }> };

/**
 * PATCH /api/admin/exams/:id/stages — set the exam lifecycle.
 *
 * Writes dates only. Status is derived from them on read, so saving a date is
 * all it takes for the aspirant-facing lifecycle meter and the objection
 * window gate to update themselves.
 */
export const PATCH = handler(async (req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const scope = await requireAdminApi();
  const input = updateStagesSchema.parse(await req.json());

  const exam = await db.exam.findUnique({
    where: { id },
    select: { id: true, name: true, boardId: true, archivedAt: true },
  });

  if (!exam) throw new ApiError(404, "That exam no longer exists.");
  assertBoardAllowed(scope, exam.boardId);
  if (exam.archivedAt) {
    throw new ApiError(409, "This exam is archived. Restore it before editing.");
  }

  // Each tier keeps its own lifecycle: Tier 1's objection window closes months
  // before Tier 2's opens, so they cannot share a set of stages.
  const phase = await db.examPhase.findFirst({
    where: { id: input.phaseId, examId: id },
    select: {
      id: true,
      name: true,
      stages: {
        select: {
          stage: true,
          startsAt: true,
          endsAt: true,
          note: true,
          statusOverride: true,
        },
      },
    },
  });
  if (!phase) {
    throw new ApiError(400, "That phase doesn't belong to this exam.");
  }

  const before = Object.fromEntries(
    phase.stages.map((s) => [
      s.stage,
      { startsAt: toDayInput(s.startsAt), endsAt: toDayInput(s.endsAt) },
    ])
  );

  // Upsert so a stage missing from the table (older exams) is created rather
  // than silently skipped.
  const order = ["CONDUCTED", "ANSWER_KEY_RELEASED", "OBJECTION_WINDOW", "FINAL_KEY", "RESULT"];

  for (const stage of input.stages) {
    const data = {
      startsAt: parseDay(stage.startsAt),
      endsAt: parseDay(stage.endsAt),
      note: stage.note ?? null,
      statusOverride: stage.statusOverride ?? null,
      sortOrder: order.indexOf(stage.stage) + 1,
    };

    await db.examStageEntry.upsert({
      where: { phaseId_stage: { phaseId: phase.id, stage: stage.stage } },
      create: { phaseId: phase.id, stage: stage.stage, ...data },
      update: data,
    });
  }

  // Backfilling an old exam shouldn't spam anyone about windows long closed.
  if (input.suppressAnnouncements) {
    await suppressPastAnnouncements(id);
  }

  // Anything that has come due now goes out immediately.
  const announced = await runDueAnnouncements(id);

  const changed = input.stages
    .filter((s) => {
      const prev = before[s.stage];
      return (
        !prev ||
        prev.startsAt !== (s.startsAt ?? "") ||
        prev.endsAt !== (s.endsAt ?? "")
      );
    })
    .map((s) => STAGE_LABEL[s.stage]);

  await audit({
    actor: scope.user,
    action: "exam.stage.update",
    targetType: "Exam",
    targetId: id,
    summary:
      changed.length > 0
        ? `Updated ${changed.join(", ")} for ${exam.name} ${phase.name}`
        : `Reviewed lifecycle for ${exam.name} ${phase.name}`,
    metadata: { phaseId: phase.id, before, after: input.stages },
  });

  return ok({
    success: true,
    notificationsSent: announced.sent,
    announced: announced.transitions,
  });
});
