import { db } from "@/lib/db";
import { ApiError, handler, ok } from "@/lib/api";
import { assertBoardAllowed, requireAdminApi } from "@/lib/admin";
import { audit } from "@/lib/audit";
import { phaseSchema } from "@/lib/adminValidation";
import { STAGE_ORDER } from "@/lib/lifecycle";

/**
 * POST /api/admin/phases — add a tier to an exam.
 *
 * The five lifecycle stages are created undated alongside it, so the new phase
 * shows a complete "TBA" stepper instead of an empty one the admin has to
 * assemble stage by stage.
 */
export const POST = handler(async (req: Request) => {
  const scope = await requireAdminApi();
  const input = phaseSchema.parse(await req.json());

  const exam = await db.exam.findUnique({
    where: { id: input.examId },
    select: { id: true, name: true, boardId: true, archivedAt: true },
  });
  if (!exam) throw new ApiError(404, "That exam no longer exists.");
  assertBoardAllowed(scope, exam.boardId);
  if (exam.archivedAt) {
    throw new ApiError(409, "This exam is archived. Restore it before editing.");
  }

  // The next free slot is one past the highest in use, not one past the count.
  // Those differ the moment a phase is deleted, and the count is what the form
  // used to send.
  const last = await db.examPhase.findFirst({
    where: { examId: exam.id },
    orderBy: { sequence: "desc" },
    select: { sequence: true },
  });
  const sequence = input.sequence ?? (last ? last.sequence + 1 : 1);

  const clash = await db.examPhase.findFirst({
    where: { examId: exam.id, OR: [{ slug: input.slug }, { sequence }] },
    select: { slug: true, sequence: true },
  });
  if (clash) {
    throw new ApiError(
      409,
      clash.slug === input.slug
        ? `This exam already has a phase called "${input.slug}".`
        : `This exam already has a phase at position ${sequence}.`
    );
  }

  const phase = await db.examPhase.create({
    data: {
      examId: exam.id,
      slug: input.slug,
      name: input.name,
      shortName: input.shortName,
      kind: input.kind,
      sequence,
      description: input.description ?? null,
      stages: {
        create: STAGE_ORDER.map((stage, index) => ({
          stage,
          sortOrder: index + 1,
        })),
      },
    },
    select: { id: true, name: true },
  });

  await audit({
    actor: scope.user,
    action: "exam.phase.create",
    targetType: "Exam",
    targetId: exam.id,
    summary: `Added phase ${phase.name} to ${exam.name}`,
  });

  return ok({ phase }, 201);
});
