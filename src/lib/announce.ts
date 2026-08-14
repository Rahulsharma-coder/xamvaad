import { db } from "./db";
import {
  STAGE_ANNOUNCEMENT,
  deriveStageStatus,
  stageEndBoundary,
} from "./lifecycle";
import type { ExamStage } from "@/prisma/client";

/**
 * Lifecycle announcements.
 *
 * Three problems this solves, all of which bite at scale:
 *
 *  1. **Audience.** "Notify every student" would mean every registered user,
 *     so an IBPS aspirant gets SSC CGL alerts. Instead the audience is anyone
 *     who has actually engaged with that exam — posted, commented, voted,
 *     marked an answer or saved something. That is a reliable interest signal
 *     and needs no follow button.
 *
 *  2. **Volume.** One Notification row per recipient means tens of thousands
 *     of inserts. They go in batches, never one at a time.
 *
 *  3. **Repeats.** Editing a date must not re-notify. Each transition stamps
 *     `startAnnouncedAt` / `endAnnouncedAt`, and the stamp is claimed with a
 *     conditional update so two concurrent requests cannot both send.
 */

const BATCH_SIZE = 1_000;

/** Everyone who has engaged with this exam, deduplicated. */
export async function examAudience(examId: string): Promise<string[]> {
  const [posters, commenters, objectors, markers, savers, estimators] =
    await Promise.all([
      db.post.findMany({
        where: { examId, deletedAt: null },
        select: { authorId: true },
        distinct: ["authorId"],
      }),
      db.comment.findMany({
        where: { post: { examId }, deletedAt: null },
        select: { authorId: true },
        distinct: ["authorId"],
      }),
      db.objectionVote.findMany({
        where: { question: { examId } },
        select: { userId: true },
        distinct: ["userId"],
      }),
      db.questionMark.findMany({
        where: { question: { examId } },
        select: { userId: true },
        distinct: ["userId"],
      }),
      db.savedPost.findMany({
        where: { post: { examId } },
        select: { userId: true },
        distinct: ["userId"],
      }),
      db.cutoffEstimate.findMany({
        where: { post: { examId } },
        select: { userId: true },
        distinct: ["userId"],
      }),
    ]);

  const ids = new Set<string>();
  for (const row of posters) ids.add(row.authorId);
  for (const row of commenters) ids.add(row.authorId);
  for (const row of objectors) ids.add(row.userId);
  for (const row of markers) ids.add(row.userId);
  for (const row of savers) ids.add(row.userId);
  for (const row of estimators) ids.add(row.userId);

  return [...ids];
}

/**
 * Everyone with an account, minus the author and anyone banned.
 *
 * The one audience that deliberately ignores the interest signal above. An
 * Official Update is a board speaking — a date moving, a key going up — and
 * that is news to someone who has not posted about the exam yet, often
 * precisely because they have not. Staff publish few of them and each one is a
 * deliberate act, so the volume argument that shapes the rest of this file does
 * not apply the way it does to automatic lifecycle alerts.
 */
export async function allUsers(exceptUserId?: string): Promise<string[]> {
  const users = await db.user.findMany({
    where: {
      isBanned: false,
      ...(exceptUserId ? { id: { not: exceptUserId } } : {}),
    },
    select: { id: true },
  });
  return users.map((u) => u.id);
}

/** Inserts one notification per recipient, in batches. */
export async function notifyMany(
  userIds: string[],
  payload: {
    type: "OFFICIAL_UPDATE" | "OBJECTION_MILESTONE" | "MODERATION";
    message: string;
    postId?: string | null;
  }
): Promise<number> {
  if (userIds.length === 0) return 0;

  let written = 0;
  for (let i = 0; i < userIds.length; i += BATCH_SIZE) {
    const slice = userIds.slice(i, i + BATCH_SIZE);
    const result = await db.notification.createMany({
      data: slice.map((userId) => ({
        userId,
        type: payload.type,
        message: payload.message,
        postId: payload.postId ?? null,
      })),
    });
    written += result.count;
  }
  return written;
}

/**
 * Sends any lifecycle announcements that have come due for one exam.
 *
 * Called opportunistically on read — the exam hub and the admin dashboard both
 * invoke it — so a window that opens at 06:00 announces itself the moment the
 * first person looks at that exam, with no scheduler to operate. Each
 * transition is claimed atomically, so concurrent readers cannot double-send.
 */
export async function runDueAnnouncements(
  examId: string,
  now: Date = new Date()
): Promise<{ sent: number; transitions: string[] }> {
  const exam = await db.exam.findUnique({
    where: { id: examId },
    select: {
      id: true,
      name: true,
      archivedAt: true,
      phases: {
        select: {
          id: true,
          name: true,
          stages: {
            select: {
              id: true,
              stage: true,
              statusOverride: true,
              startsAt: true,
              endsAt: true,
              startAnnouncedAt: true,
              endAnnouncedAt: true,
            },
          },
        },
        orderBy: { sequence: "asc" },
      },
    },
  });

  // Archived exams are historical; they never announce anything.
  if (!exam || exam.archivedAt) return { sent: 0, transitions: [] };

  const due: { stageId: string; field: "start" | "end"; message: string }[] = [];

  // Each phase runs its own lifecycle, so Tier 1 and Tier 2 announce
  // independently. The phase name is in the message because "objection window
  // is now open" is meaningless when an exam has four of them.
  for (const phase of exam.phases) {
    const label = `${exam.name} ${phase.name}`;

    for (const stage of phase.stages) {
      const copy = STAGE_ANNOUNCEMENT[stage.stage as ExamStage];

      if (
        stage.startsAt &&
        stage.startsAt <= now &&
        !stage.startAnnouncedAt &&
        copy.start
      ) {
        due.push({
          stageId: stage.id,
          field: "start",
          message: `${label} ${copy.start}`,
        });
      }

      // Against the same inclusive boundary the status derivation uses,
      // otherwise "the window has closed" would go out at midnight on its
      // final day while the exam hub still showed it open.
      if (
        stage.endsAt &&
        stageEndBoundary(stage.endsAt) <= now &&
        !stage.endAnnouncedAt &&
        copy.end
      ) {
        due.push({
          stageId: stage.id,
          field: "end",
          message: `${label} ${copy.end}`,
        });
      }
    }
  }

  if (due.length === 0) return { sent: 0, transitions: [] };

  const audience = await examAudience(examId);
  let sent = 0;
  const transitions: string[] = [];

  for (const item of due) {
    // Claim the transition first. The `null` guard means only one caller wins;
    // a loser updates 0 rows and skips, so nobody is notified twice.
    const claim = await db.examStageEntry.updateMany({
      where:
        item.field === "start"
          ? { id: item.stageId, startAnnouncedAt: null }
          : { id: item.stageId, endAnnouncedAt: null },
      data:
        item.field === "start"
          ? { startAnnouncedAt: now }
          : { endAnnouncedAt: now },
    });

    if (claim.count === 0) continue;

    sent += await notifyMany(audience, {
      type: "OFFICIAL_UPDATE",
      message: item.message,
    });
    transitions.push(item.message);
  }

  return { sent, transitions };
}

/**
 * Marks past transitions as announced without sending anything.
 *
 * Used when an admin backfills historical dates on an old exam — nobody wants
 * a burst of alerts for a window that closed last month.
 */
export async function suppressPastAnnouncements(
  examId: string,
  now: Date = new Date()
): Promise<void> {
  await db.examStageEntry.updateMany({
    where: { phase: { examId }, startsAt: { lte: now }, startAnnouncedAt: null },
    data: { startAnnouncedAt: now },
  });
  await db.examStageEntry.updateMany({
    where: { phase: { examId }, endsAt: { lte: now }, endAnnouncedAt: null },
    data: { endAnnouncedAt: now },
  });
}

export { deriveStageStatus };
