import { db } from "@/lib/db";
import { ApiError, handler, ok } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { pollVoteSchema } from "@/lib/validation";

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST /api/polls/:id/vote
 *
 * One vote per user per poll. Re-voting moves the vote to the new option
 * rather than being rejected, which is what the wireframe's post-vote state
 * implies (the user always sees their own choice highlighted).
 */
export const POST = handler(async (req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const user = await requireUser();
  const { optionId } = pollVoteSchema.parse(await req.json());

  const poll = await db.poll.findUnique({
    where: { id },
    select: {
      id: true,
      closesAt: true,
      options: { select: { id: true } },
    },
  });
  if (!poll) throw new ApiError(404, "That poll no longer exists.");
  if (poll.closesAt && poll.closesAt < new Date()) {
    throw new ApiError(410, "This poll has closed.");
  }
  if (!poll.options.some((o) => o.id === optionId)) {
    throw new ApiError(400, "That option is not part of this poll.");
  }

  const existing = await db.pollVote.findUnique({
    where: { pollId_userId: { pollId: id, userId: user.id } },
    select: { id: true, optionId: true },
  });

  if (existing?.optionId === optionId) {
    // Nothing to do — treat a repeat vote as success so the UI stays simple.
    const options = await db.pollOption.findMany({
      where: { pollId: id },
      select: { id: true, label: true, text: true, voteCount: true },
      orderBy: { sortOrder: "asc" },
    });
    return ok({ options, votedOptionId: optionId });
  }

  await db.$transaction(async (tx) => {
    if (existing) {
      await tx.pollVote.update({
        where: { id: existing.id },
        data: { optionId },
      });
      await tx.pollOption.update({
        where: { id: existing.optionId },
        data: { voteCount: { decrement: 1 } },
      });
    } else {
      await tx.pollVote.create({
        data: { pollId: id, optionId, userId: user.id },
      });
    }
    await tx.pollOption.update({
      where: { id: optionId },
      data: { voteCount: { increment: 1 } },
    });
  });

  const options = await db.pollOption.findMany({
    where: { pollId: id },
    select: { id: true, label: true, text: true, voteCount: true },
    orderBy: { sortOrder: "asc" },
  });

  return ok({ options, votedOptionId: optionId });
});
