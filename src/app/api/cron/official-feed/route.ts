import { timingSafeEqual } from "node:crypto";
import { ApiError, handler, ok } from "@/lib/api";
import { runOfficialFeed } from "@/lib/officialFeed";

// Reading the feed and a few entry pages from a slow government-adjacent site.
export const maxDuration = 60;

function authorised(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  // Unset means unconfigured, not open: refuse rather than let anyone publish.
  if (!secret) return false;

  const given = Buffer.from(req.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/**
 * POST /api/cron/official-feed — announce new Sarkari Result entries.
 *
 * Called every few hours by the scheduled GitHub workflow with
 * `Authorization: Bearer $CRON_SECRET`. `?dryRun=1` reports what would be
 * published without writing anything. GET is accepted too, which is what a
 * Vercel Cron job sends.
 */
const run = handler(async (req: Request) => {
  if (!authorised(req)) throw new ApiError(401, "Not authorised.");

  const dryRun = new URL(req.url).searchParams.get("dryRun") === "1";
  const results = await runOfficialFeed({ dryRun });

  return ok({
    dryRun,
    published: results.filter((r) => r.status === "PUBLISHED").length,
    results,
  });
});

export const GET = run;
export const POST = run;
