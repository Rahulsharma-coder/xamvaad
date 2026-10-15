import type { FeedRunStatus } from "@/prisma/client";
import { db } from "./db";

/**
 * Whether the official feed needs an admin's attention.
 *
 * Two ways it can go wrong. A run can fail — Sarkari Result blocks us, is
 * down, or changes its feed — and that run is recorded. Or runs can stop
 * arriving at all: a wrong CRON_SECRET in GitHub, or GitHub pausing the
 * schedule, fails before our code is reached, so the only sign is silence.
 */

/** Hourly runs, plus room for GitHub starting a scheduled run late. */
const STALE_AFTER_MS = 3 * 60 * 60 * 1000;

export type FeedAlert =
  | {
      kind: "failing";
      status: Exclude<FeedRunStatus, "OK">;
      since: Date;
      failedRuns: number;
      lastAttempt: Date;
      error: string | null;
      httpStatus: number | null;
    }
  | { kind: "stale"; lastRun: Date };

/** Null when the feed is healthy, or has never run. */
export async function getFeedAlert(): Promise<FeedAlert | null> {
  const last = await db.feedRun.findFirst({
    orderBy: { createdAt: "desc" },
    select: { status: true, error: true, httpStatus: true, createdAt: true },
  });
  if (!last) return null;

  if (last.status !== "OK") {
    const lastOk = await db.feedRun.findFirst({
      where: { status: "OK" },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    });
    const sinceOk = lastOk ? { createdAt: { gt: lastOk.createdAt } } : {};
    const [first, failedRuns] = await Promise.all([
      db.feedRun.findFirst({
        where: sinceOk,
        orderBy: { createdAt: "asc" },
        select: { createdAt: true },
      }),
      db.feedRun.count({ where: sinceOk }),
    ]);

    return {
      kind: "failing",
      status: last.status,
      since: first?.createdAt ?? last.createdAt,
      failedRuns,
      lastAttempt: last.createdAt,
      error: last.error,
      httpStatus: last.httpStatus,
    };
  }

  if (Date.now() - last.createdAt.getTime() > STALE_AFTER_MS) {
    return { kind: "stale", lastRun: last.createdAt };
  }

  return null;
}
