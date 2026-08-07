import { db } from "@/lib/db";
import { ApiError, handler, ok } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import { getTrackedQuestions } from "@/lib/queries";
import { objectionLevel, objectionPercent } from "@/lib/rules";

type Ctx = { params: Promise<{ slug: string }> };

/** GET /api/exams/:slug/questions — the Objection Tracker list (wireframe 08). */
export const GET = handler(async (req: Request, ctx: Ctx) => {
  const { slug } = await ctx.params;
  const url = new URL(req.url);

  const exam = await db.exam.findUnique({
    where: { slug },
    select: { id: true },
  });
  if (!exam) throw new ApiError(404, "That exam no longer exists.");

  const questions = await getTrackedQuestions(
    exam.id,
    url.searchParams.get("sessionId") ?? undefined
  );

  // Tell the viewer how they voted, without exposing anyone else's stance.
  const user = await getCurrentUser();
  const myVotes = user
    ? await db.objectionVote.findMany({
        where: { userId: user.id, questionId: { in: questions.map((q) => q.id) } },
        select: { questionId: true, stance: true },
      })
    : [];
  const stanceByQuestion = new Map(myVotes.map((v) => [v.questionId, v.stance]));

  return ok({
    questions: questions.map((q) => ({
      ...q,
      totalVotes: q.objectVotes + q.correctVotes,
      percent: objectionPercent(q.objectVotes, q.correctVotes),
      level: objectionLevel(q.objectVotes, q.correctVotes),
      discussionCount: q._count.posts,
      myStance: stanceByQuestion.get(q.id) ?? null,
    })),
  });
});
