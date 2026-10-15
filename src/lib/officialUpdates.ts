import { db } from "./db";
import { allUsers, notifyMany } from "./announce";
import { autoTagsFor, normaliseTag } from "./rules";

/**
 * Publishes an Official Update.
 *
 * One action, three effects: the post is created under the staff account, the
 * automatic tags are attached, and every account is notified. Doing these
 * separately is how an announcement ends up published but never delivered.
 *
 * Shared by the admin form and the Sarkari Result feed job, so an update reads
 * and reaches people the same way whichever of them wrote it.
 */
export async function publishOfficialUpdate(input: {
  authorId: string;
  exam: {
    id: string;
    name: string;
    shortName: string;
    boardId: string;
    board: { name: string };
  };
  title: string;
  body: string;
  sourceUrl?: string | null;
  notify?: boolean;
}): Promise<{ id: string; notified: number }> {
  const { exam } = input;

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
      authorId: input.authorId,
      boardId: exam.boardId,
      examId: exam.id,
      type: "OFFICIAL_UPDATE",
      title: input.title,
      body: input.body,
      sourceUrl: input.sourceUrl ?? null,
      isPinned: true,
      tags: { create: tagIds.map((tagId) => ({ tagId })) },
    },
    select: { id: true },
  });

  let notified = 0;
  if (input.notify !== false) {
    const audience = await allUsers(input.authorId);
    notified = await notifyMany(audience, {
      type: "OFFICIAL_UPDATE",
      message: `${exam.name}: ${input.title}`,
      postId: post.id,
    });
  }

  return { id: post.id, notified };
}
