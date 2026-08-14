import { db } from "@/lib/db";
import { ApiError, handler, ok } from "@/lib/api";
import { assertBoardAllowed, requireAdminApi } from "@/lib/admin";
import { audit } from "@/lib/audit";
import { officialUpdateSchema } from "@/lib/adminValidation";
import { allUsers, notifyMany } from "@/lib/announce";
import { autoTagsFor, normaliseTag } from "@/lib/rules";

/**
 * POST /api/admin/updates — publish an Official Update.
 *
 * One action, three effects: the post is created under the staff account, the
 * automatic tags are attached, and every account is notified. Doing these
 * separately is how an announcement ends up published but never delivered.
 */
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

  // Official Updates concern the exam as a whole, so they carry no date or
  // shift tag — the same rule that keeps Discussions out of a single sitting.
  const labels = autoTagsFor({
    type: "OFFICIAL_UPDATE",
    boardName: exam.board.name,
    examShortName: exam.shortName,
  });

  const tagIds: string[] = [];
  for (const label of labels) {
    const name = normaliseTag(label);
    if (!name) continue;
    const tag = await db.tag.upsert({
      where: { name },
      create: { name, label, kind: "AUTO" },
      update: {},
      select: { id: true },
    });
    tagIds.push(tag.id);
  }

  const post = await db.post.create({
    data: {
      authorId: scope.user.id,
      boardId: exam.boardId,
      examId: exam.id,
      type: "OFFICIAL_UPDATE",
      title: input.title,
      body: input.body,
      isPinned: true,
      tags: { create: tagIds.map((tagId) => ({ tagId })) },
    },
    select: { id: true },
  });

  let notified = 0;
  if (input.notify !== false) {
    const audience = await allUsers(scope.user.id);
    notified = await notifyMany(audience, {
      type: "OFFICIAL_UPDATE",
      message: `${exam.name}: ${input.title}`,
      postId: post.id,
    });
  }

  await audit({
    actor: scope.user,
    action: "update.publish",
    targetType: "Post",
    targetId: post.id,
    summary: `Published official update "${input.title}" for ${exam.name} (${notified} notified)`,
  });

  return ok({ id: post.id, notified }, 201);
});
