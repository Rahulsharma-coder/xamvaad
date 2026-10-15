import { db } from "@/lib/db";
import { ApiError, handler, ok } from "@/lib/api";
import { assertBoardAllowed, requireAdminApi } from "@/lib/admin";
import { audit } from "@/lib/audit";
import { officialUpdateSchema } from "@/lib/adminValidation";
import { publishOfficialUpdate } from "@/lib/officialUpdates";

/** POST /api/admin/updates — publish an Official Update. */
export const POST = handler(async (req: Request) => {
  const scope = await requireAdminApi();
  const input = officialUpdateSchema.parse(await req.json());

  const exam = await db.exam.findUnique({
    where: { id: input.examId },
    select: {
      id: true,
      name: true,
      shortName: true,
      boardId: true,
      archivedAt: true,
      board: { select: { id: true, name: true } },
    },
  });
  if (!exam) throw new ApiError(404, "That exam no longer exists.");
  assertBoardAllowed(scope, exam.boardId);
  if (exam.archivedAt) {
    throw new ApiError(409, "This exam is archived and accepts no new posts.");
  }

  const post = await publishOfficialUpdate({
    authorId: scope.user.id,
    exam,
    title: input.title,
    body: input.body,
    notify: input.notify,
  });

  await audit({
    actor: scope.user,
    action: "update.publish",
    targetType: "Post",
    targetId: post.id,
    summary: `Published official update "${input.title}" for ${exam.name} (${post.notified} notified)`,
  });

  return ok(post, 201);
});
