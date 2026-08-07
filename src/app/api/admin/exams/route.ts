import { db } from "@/lib/db";
import { ApiError, handler, ok } from "@/lib/api";
import { requireFullAdminApi } from "@/lib/admin";
import { audit } from "@/lib/audit";
import { examSchema } from "@/lib/adminValidation";
import { STAGE_ORDER } from "@/lib/lifecycle";

/**
 * POST /api/admin/exams — create an exam.
 *
 * The five lifecycle stages are created undated alongside it, so the exam
 * appears with a complete "TBA" stepper rather than an empty one that the
 * admin has to assemble stage by stage.
 */
export const POST = handler(async (req: Request) => {
  const admin = await requireFullAdminApi();
  const input = examSchema.parse(await req.json());

  const [board, clash] = await Promise.all([
    db.board.findUnique({ where: { id: input.boardId }, select: { id: true, name: true } }),
    db.exam.findUnique({ where: { slug: input.slug }, select: { id: true } }),
  ]);

  if (!board) throw new ApiError(404, "That board no longer exists.");
  if (clash) throw new ApiError(409, `An exam with slug "${input.slug}" exists.`);

  const exam = await db.exam.create({
    data: {
      boardId: input.boardId,
      slug: input.slug,
      name: input.name,
      shortName: input.shortName,
      year: input.year,
      description: input.description ?? null,
      // A new exam starts with one written phase so it is immediately usable;
      // further tiers are added from the exam's admin page.
      phases: {
        create: {
          slug: "phase-1",
          name: "Phase 1",
          shortName: "P1",
          kind: "WRITTEN",
          sequence: 1,
          stages: {
            create: STAGE_ORDER.map((stage, index) => ({
              stage,
              sortOrder: index + 1,
            })),
          },
        },
      },
    },
    select: { id: true, slug: true, name: true },
  });

  await audit({
    actor: admin,
    action: "exam.create",
    targetType: "Exam",
    targetId: exam.id,
    summary: `Created ${exam.name} under ${board.name}`,
  });

  return ok({ exam }, 201);
});
