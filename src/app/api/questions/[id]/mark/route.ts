import { db } from "@/lib/db";
import { ApiError, handler, ok } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { markAnswerSchema } from "@/lib/validation";

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST /api/questions/:id/mark — "What did you mark?"
 *
 * Records the option this user actually selected in the exam. Distinct from
 * the objection vote: marking is a statement of fact about your own paper,
 * objecting is an opinion about the answer key. A user may change their mark,
 * which moves the tally from the old option to the new one.
 */
export const POST = handler(async (req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const user = await requireUser();
  const { optionId } = markAnswerSchema.parse(await req.json());

  const option = await db.questionOption.findUnique({
    where: { id: optionId },
    select: { id: true, questionId: true },
  });
  if (!option || option.questionId !== id) {
    throw new ApiError(400, "That option doesn't belong to this question.");
  }

  const existing = await db.questionMark.findUnique({
    where: { questionId_userId: { questionId: id, userId: user.id } },
    select: { id: true, optionId: true },
  });

  if (existing?.optionId !== optionId) {
    await db.$transaction(async (tx) => {
      if (existing) {
        await tx.questionMark.update({
          where: { id: existing.id },
          data: { optionId },
        });
        await tx.questionOption.update({
          where: { id: existing.optionId },
          data: { markCount: { decrement: 1 } },
        });
      } else {
        await tx.questionMark.create({
          data: { questionId: id, optionId, userId: user.id },
        });
      }

      await tx.questionOption.update({
        where: { id: optionId },
        data: { markCount: { increment: 1 } },
      });
    });
  }

  const options = await db.questionOption.findMany({
    where: { questionId: id },
    orderBy: { sortOrder: "asc" },
    select: { id: true, label: true, text: true, markCount: true },
  });

  return ok({
    options,
    totalMarks: options.reduce((sum, o) => sum + o.markCount, 0),
    myOptionId: optionId,
  });
});
