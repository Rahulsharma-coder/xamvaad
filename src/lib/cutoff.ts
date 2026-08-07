import { db } from "./db";
import { EXAM_CATEGORIES, summariseEstimates } from "./rules";

export type CutoffSummary = Awaited<ReturnType<typeof summariseCutoffPost>>;

/**
 * Community median and range per category for one Expected Cutoff post, plus
 * the caller's own estimate.
 *
 * Lives here rather than in the route handler so the post page can render the
 * table on first paint instead of fetching it after mount.
 */
export async function summariseCutoffPost(
  postId: string,
  userId: string | null
) {
  const estimates = await db.cutoffEstimate.findMany({
    where: { postId },
    select: { userId: true, category: true, marks: true },
  });

  const community = Object.fromEntries(
    EXAM_CATEGORIES.map((category) => [
      category,
      summariseEstimates(
        estimates.filter((e) => e.category === category).map((e) => e.marks)
      ),
    ])
  );

  const mine = userId
    ? estimates.find((e) => e.userId === userId) ?? null
    : null;

  return {
    community,
    totalEstimates: estimates.length,
    myEstimate: mine ? { category: mine.category, marks: mine.marks } : null,
  };
}
