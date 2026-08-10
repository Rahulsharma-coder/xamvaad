import type { Prisma, PostType } from "@/prisma/client";
import { db } from "./db";

/**
 * Shared read queries used by both server components and route handlers, so
 * the feed shows exactly the same shape however it is fetched.
 */

export const postCardSelect = {
  id: true,
  type: true,
  title: true,
  body: true,
  likeCount: true,
  commentCount: true,
  viewCount: true,
  isPinned: true,
  createdAt: true,
  editedAt: true,
  questionId: true,
  recallConfidence: true,
  cutoffBasis: true,
  cutoffPredictions: {
    select: { category: true, marks: true },
  },
  author: {
    select: { id: true, name: true, username: true, image: true, role: true },
  },
  board: { select: { id: true, slug: true, name: true, color: true } },
  exam: { select: { id: true, slug: true, name: true, shortName: true } },
  phase: { select: { id: true, slug: true, name: true, shortName: true } },
  session: { select: { id: true, date: true, shift: true } },
  tags: { select: { tag: { select: { name: true, label: true, kind: true } } } },
  poll: {
    select: {
      id: true,
      question: true,
      closesAt: true,
      options: {
        select: { id: true, label: true, text: true, voteCount: true },
        orderBy: { sortOrder: "asc" },
      },
    },
  },
} satisfies Prisma.PostSelect;

export type PostCard = Prisma.PostGetPayload<{ select: typeof postCardSelect }>;

export type FeedFilters = {
  boardSlug?: string;
  examSlug?: string;
  /** Restrict to one tier. Tier 2 discussion must not surface under Tier 1. */
  phaseId?: string;
  sessionId?: string;
  date?: string;
  shift?: string;
  type?: PostType;
  tag?: string;
  authorId?: string;
  savedByUserId?: string;
  sort?: "latest" | "top";
};

/**
 * A post the public can see.
 *
 * Deleting a post soft-deletes it and moderation hides rather than removes, so
 * the table holds rows nobody can reach. Every public tally has to exclude
 * them or it advertises content that isn't there — a board card read "2 posts"
 * when both had been removed, and clicking through showed an empty board.
 *
 * Exported so counts and the feed cannot drift apart: they are the same claim
 * about the same rows, and only one of them is easy to check by eye.
 */
export const VISIBLE_POST = {
  status: "ACTIVE",
  deletedAt: null,
} as const satisfies Prisma.PostWhereInput;

export function buildFeedWhere(filters: FeedFilters): Prisma.PostWhereInput {
  const where: Prisma.PostWhereInput = { ...VISIBLE_POST };

  if (filters.boardSlug) where.board = { slug: filters.boardSlug };
  if (filters.examSlug) where.exam = { slug: filters.examSlug };
  if (filters.phaseId) where.phaseId = filters.phaseId;
  if (filters.type) where.type = filters.type;
  if (filters.authorId) where.authorId = filters.authorId;

  if (filters.sessionId) {
    where.sessionId = filters.sessionId;
  } else if (filters.date || filters.shift) {
    // Filte0r by the session's attributes rather than its id.
    where.session = {
      ...(filters.date
        ? { date: new Date(`${filters.date}T00:00:00.000Z`) }
        : {}),
      ...(filters.shift ? { shift: filters.shift } : {}),
    };
  }

  if (filters.tag) {
    where.tags = { some: { tag: { name: filters.tag.toLowerCase() } } };
  }

  if (filters.savedByUserId) {
    where.saves = { some: { userId: filters.savedByUserId } };
  }

  return where;
}

export async function getFeed(
  filters: FeedFilters,
  opts: { skip?: number; take?: number } = {}
) {
  const { skip = 0, take = 20 } = opts;

  const orderBy: Prisma.PostOrderByWithRelationInput[] =
    filters.sort === "top"
      ? [{ isPinned: "desc" }, { likeCount: "desc" }, { createdAt: "desc" }]
      : [{ isPinned: "desc" }, { createdAt: "desc" }];

  const where = buildFeedWhere(filters);

  const [posts, total] = await Promise.all([
    db.post.findMany({ where, select: postCardSelect, orderBy, skip, take }),
    db.post.count({ where }),
  ]);

  return { posts, total, hasMore: skip + posts.length < total };
}

export async function getPost(id: string) {
  return db.post.findFirst({
    where: { id, deletedAt: null },
    select: {
      ...postCardSelect,
      status: true,
      updatedAt: true,
      question: {
        select: {
          id: true,
          number: true,
          text: true,
          subject: true,
          officialAnswer: true,
          isResolved: true,
          objectVotes: true,
          correctVotes: true,
          options: {
            select: { id: true, label: true, text: true, markCount: true },
            orderBy: { sortOrder: "asc" },
          },
        },
      },
    },
  });
}

/** Which posts in a list the current user has liked/saved, and how they voted. */
export async function getViewerState(userId: string | null, postIds: string[]) {
  if (!userId || postIds.length === 0) {
    return { liked: new Set<string>(), saved: new Set<string>(), pollVotes: new Map<string, string>() };
  }

  const [likes, saves, votes] = await Promise.all([
    db.postLike.findMany({
      where: { userId, postId: { in: postIds } },
      select: { postId: true },
    }),
    db.savedPost.findMany({
      where: { userId, postId: { in: postIds } },
      select: { postId: true },
    }),
    db.pollVote.findMany({
      where: { userId, poll: { postId: { in: postIds } } },
      select: { optionId: true, poll: { select: { postId: true } } },
    }),
  ]);

  return {
    liked: new Set(likes.map((l) => l.postId)),
    saved: new Set(saves.map((s) => s.postId)),
    pollVotes: new Map(votes.map((v) => [v.poll.postId, v.optionId])),
  };
}

export async function getExamBySlug(slug: string) {
  return db.exam.findUnique({
    where: { slug },
    select: {
      id: true,
      slug: true,
      name: true,
      shortName: true,
      year: true,
      description: true,
      board: { select: { id: true, slug: true, name: true, color: true } },
      sessions: {
        select: {
          id: true,
          date: true,
          shift: true,
          // Used to pick a sensible default shift — see pickDefaultSession.
          _count: {
            select: { posts: { where: VISIBLE_POST }, questions: true },
          },
        },
        orderBy: [{ date: "desc" }, { shift: "asc" }],
      },
      phases: {
        select: {
          id: true,
          slug: true,
          name: true,
          shortName: true,
          kind: true,
          sequence: true,
          sessions: {
            select: {
              id: true,
              date: true,
              shift: true,
              // Used to pick a sensible default shift — see pickDefaultSession.
              _count: {
                select: { posts: { where: VISIBLE_POST }, questions: true },
              },
            },
            orderBy: [{ date: "desc" }, { shift: "asc" }],
          },
          stages: {
            select: {
              id: true,
              stage: true,
              statusOverride: true,
              startsAt: true,
              endsAt: true,
              note: true,
            },
            orderBy: { sortOrder: "asc" },
          },
        },
        orderBy: { sequence: "asc" },
      },
    },
  });
}

/**
 * Chooses which shift the exam hub opens on.
 *
 * The newest sitting is usually the wrong answer: a shift that just finished
 * has no answer key, no tracked questions and no discussion, so the hub would
 * open on an empty tab while the active shift sits one dropdown away. Rank by
 * actual activity instead, falling back to the newest when nothing has any.
 */
export function pickDefaultSession<
  T extends { _count: { posts: number; questions: number } },
>(sessions: T[]): T | null {
  if (sessions.length === 0) return null;

  const activity = (s: T) => s._count.posts + s._count.questions;
  // Sessions arrive newest-first, so a strict `>` keeps the newest on a tie.
  return sessions.reduce((best, s) => (activity(s) > activity(best) ? s : best));
}

/** Exams for the home screen, ordered by how much discussion they're drawing. */
export async function getActiveExams(take = 8) {
  const exams = await db.exam.findMany({
    where: { isActive: true },
    select: {
      id: true,
      slug: true,
      name: true,
      shortName: true,
      board: { select: { slug: true, name: true, color: true, icon: true } },
      sessions: {
        select: { id: true, date: true, shift: true },
        orderBy: { date: "desc" },
        take: 1,
      },
      _count: { select: { posts: { where: VISIBLE_POST } } },
    },
  });

  // "12.4K discussing" — posts plus comments on those posts.
  const withActivity = await Promise.all(
    exams.map(async (exam) => {
      const comments = await db.comment.count({
        where: { post: { examId: exam.id }, deletedAt: null },
      });
      return {
        ...exam,
        discussing: exam._count.posts + comments,
      };
    })
  );

  return withActivity
    .sort((a, b) => b.discussing - a.discussing)
    .slice(0, take);
}

export async function getBoards() {
  return db.board.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: "asc" },
    select: {
      id: true,
      slug: true,
      name: true,
      fullName: true,
      description: true,
      icon: true,
      color: true,
      _count: { select: { exams: true, posts: { where: VISIBLE_POST } } },
    },
  });
}

/** Objection Tracker list for one exam, most-challenged first. */
export async function getTrackedQuestions(
  examId: string,
  sessionId?: string,
  phaseId?: string
) {
  const questions = await db.question.findMany({
    where: {
      examId,
      ...(phaseId ? { phaseId } : {}),
      ...(sessionId ? { sessionId } : {}),
    },
    select: {
      id: true,
      number: true,
      text: true,
      subject: true,
      officialAnswer: true,
      finalAnswer: true,
      isResolved: true,
      objectVotes: true,
      correctVotes: true,
      phase: { select: { id: true, slug: true, name: true, shortName: true } },
  session: { select: { id: true, date: true, shift: true } },
      _count: { select: { posts: { where: VISIBLE_POST } } },
    },
  });

  // Sort by objection share, then by volume so a 100%-of-3-votes question
  // never outranks a well-supported one.
  return questions.sort((a, b) => {
    const aTotal = a.objectVotes + a.correctVotes;
    const bTotal = b.objectVotes + b.correctVotes;
    const aPct = aTotal ? a.objectVotes / aTotal : 0;
    const bPct = bTotal ? b.objectVotes / bTotal : 0;
    if (bPct !== aPct) return bPct - aPct;
    return bTotal - aTotal;
  });
}
