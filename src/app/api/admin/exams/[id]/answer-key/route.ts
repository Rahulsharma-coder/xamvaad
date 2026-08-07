import { db } from "@/lib/db";
import { ApiError, handler, ok } from "@/lib/api";
import { assertBoardAllowed, requireAdminApi } from "@/lib/admin";
import { audit } from "@/lib/audit";
import { answerKeySchema } from "@/lib/adminValidation";
import { examAudience, notifyMany } from "@/lib/announce";
import { objectionPercent } from "@/lib/rules";

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST /api/admin/exams/:id/answer-key
 *
 * Two keys, two very different meanings:
 *
 *  - PROVISIONAL sets the answer the community is allowed to challenge.
 *  - FINAL records what the authority settled on, closes objection voting, and
 *    makes each question's outcome legible: where the final answer differs
 *    from the provisional one, the community's objection was upheld.
 *
 * That last part is the payoff of the whole Objection Tracker — it is the
 * evidence that voting here was worth doing, and nothing else on the platform
 * can produce it.
 */
export const POST = handler(async (req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const scope = await requireAdminApi();
  const input = answerKeySchema.parse(await req.json());

  const exam = await db.exam.findUnique({
    where: { id },
    select: { id: true, name: true, boardId: true, archivedAt: true },
  });
  if (!exam) throw new ApiError(404, "That exam no longer exists.");
  assertBoardAllowed(scope, exam.boardId);
  if (exam.archivedAt) {
    throw new ApiError(409, "This exam is archived.");
  }

  const session = await db.examSession.findFirst({
    where: { id: input.sessionId, examId: id },
    select: {
      id: true,
      date: true,
      shift: true,
      phaseId: true,
      phase: { select: { name: true, kind: true } },
    },
  });
  if (!session) {
    throw new ApiError(400, "That shift doesn't belong to this exam.");
  }
  // A physical test or interview has no paper to key.
  if (session.phase.kind !== "WRITTEN") {
    throw new ApiError(
      400,
      `${session.phase.name} is not a written test, so it has no answer key.`
    );
  }

  // Reject duplicate question numbers up front — a paste error here would
  // otherwise silently keep only the last value.
  const numbers = input.answers.map((a) => a.number);
  if (new Set(numbers).size !== numbers.length) {
    throw new ApiError(400, "The same question number appears more than once.");
  }

  let created = 0;
  let updated = 0;
  const upheld: { number: number; from: string; to: string; percent: number }[] = [];

  for (const entry of input.answers) {
    const existing = await db.question.findUnique({
      where: { sessionId_number: { sessionId: session.id, number: entry.number } },
      select: {
        id: true,
        officialAnswer: true,
        objectVotes: true,
        correctVotes: true,
      },
    });

    if (input.keyType === "PROVISIONAL") {
      if (existing) {
        await db.question.update({
          where: { id: existing.id },
          data: { officialAnswer: entry.answer },
        });
        updated++;
      } else {
        // Questions can be keyed before anyone has discussed them.
        await db.question.create({
          data: {
            examId: id,
            phaseId: session.phaseId,
            sessionId: session.id,
            number: entry.number,
            officialAnswer: entry.answer,
          },
        });
        created++;
      }
      continue;
    }

    // FINAL
    if (!existing) {
      await db.question.create({
        data: {
          examId: id,
          phaseId: session.phaseId,
          sessionId: session.id,
          number: entry.number,
          officialAnswer: entry.answer,
          finalAnswer: entry.answer,
          isResolved: true,
        },
      });
      created++;
      continue;
    }

    await db.question.update({
      where: { id: existing.id },
      data: { finalAnswer: entry.answer, isResolved: true },
    });
    updated++;

    // The authority changed its answer — the objection stands.
    if (existing.officialAnswer && existing.officialAnswer !== entry.answer) {
      upheld.push({
        number: entry.number,
        from: existing.officialAnswer,
        to: entry.answer,
        percent: objectionPercent(existing.objectVotes, existing.correctVotes),
      });
    }
  }

  // Tell participants when their objections actually changed something.
  let notified = 0;
  if (input.keyType === "FINAL" && upheld.length > 0) {
    const audience = await examAudience(id);
    const list = upheld.map((u) => `Q${u.number}`).join(", ");
    notified = await notifyMany(audience, {
      type: "OFFICIAL_UPDATE",
      message: `${exam.name} final key: ${upheld.length} answer${
        upheld.length === 1 ? "" : "s"
      } changed (${list}). Community objections were upheld.`,
    });
  }

  await audit({
    actor: scope.user,
    action:
      input.keyType === "FINAL" ? "exam.key.final" : "exam.key.provisional",
    targetType: "Exam",
    targetId: id,
    summary: `${
      input.keyType === "FINAL" ? "Final" : "Provisional"
    } key for ${exam.name} ${session.phase.name} (${session.shift}): ${created} added, ${updated} updated${
      upheld.length ? `, ${upheld.length} objections upheld` : ""
    }`,
    metadata: { sessionId: session.id, keyType: input.keyType, upheld },
  });

  return ok({ created, updated, upheld, notified });
});
