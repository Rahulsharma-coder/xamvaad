import { db } from "@/lib/db";
import { ApiError, handler, ok } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { objectionVoteSchema } from "@/lib/validation";
import { objectionLevel, objectionPercent } from "@/lib/rules";

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST /api/questions/:id/vote — the "Raise Objection" dialog (wireframe 10).
 *
 * Votes are anonymous in the product sense: we store userId only to enforce
 * one vote per person, and no endpoint ever returns the voter list.
 */
export const POST = handler(async (req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const user = await requireUser();
  const { stance } = objectionVoteSchema.parse(await req.json());

  const question = await db.question.findUnique({
    where: { id },
    select: { id: true, isResolved: true },
  });
  if (!question) throw new ApiError(404, "That question no longer exists.");
  if (question.isResolved) {
    throw new ApiError(
      410,
      "The final answer key is out for this question, so voting has closed."
    );
  }

  const existing = await db.objectionVote.findUnique({
    where: { questionId_userId: { questionId: id, userId: user.id } },
    select: { id: true, stance: true },
  });

  if (existing?.stance === stance) {
    const current = await db.question.findUniqueOrThrow({
      where: { id },
      select: { objectVotes: true, correctVotes: true },
    });
    return ok(summarise(current, stance));
  }

  const updated = await db.$transaction(async (tx) => {
    if (existing) {
      // Switching sides: move one vote across.
      await tx.objectionVote.update({
        where: { id: existing.id },
        data: { stance },
      });
      return tx.question.update({
        where: { id },
        data:
          stance === "OBJECT"
            ? { objectVotes: { increment: 1 }, correctVotes: { decrement: 1 } }
            : { objectVotes: { decrement: 1 }, correctVotes: { increment: 1 } },
        select: { objectVotes: true, correctVotes: true },
      });
    }

    await tx.objectionVote.create({
      data: { questionId: id, userId: user.id, stance },
    });
    return tx.question.update({
      where: { id },
      data:
        stance === "OBJECT"
          ? { objectVotes: { increment: 1 } }
          : { correctVotes: { increment: 1 } },
      select: { objectVotes: true, correctVotes: true },
    });
  });

  return ok(summarise(updated, stance));
});

function summarise(
  counts: { objectVotes: number; correctVotes: number },
  stance: "OBJECT" | "CORRECT"
) {
  return {
    objectVotes: counts.objectVotes,
    correctVotes: counts.correctVotes,
    totalVotes: counts.objectVotes + counts.correctVotes,
    percent: objectionPercent(counts.objectVotes, counts.correctVotes),
    level: objectionLevel(counts.objectVotes, counts.correctVotes),
    myStance: stance,
  };
}
