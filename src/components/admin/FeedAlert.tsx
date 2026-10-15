import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { getFeedAlert } from "@/lib/feedHealth";
import { dateTime } from "@/lib/format";

const HEADLINE = {
  BLOCKED: "Sarkari Result has blocked the official feed",
  UNREACHABLE: "Sarkari Result could not be reached",
  FAILED: "The official feed is failing",
} as const;

/**
 * The banner admins see when exam updates have stopped being posted
 * automatically. It clears itself on the next successful run.
 */
export async function FeedAlert() {
  const alert = await getFeedAlert().catch(() => null);
  if (!alert) return null;

  return (
    <div
      role="alert"
      className="mb-5 flex gap-3 rounded-xl border border-red-300 bg-red-50 p-3.5 text-sm text-red-900"
    >
      <AlertTriangle size={18} className="mt-0.5 shrink-0 text-object" />
      <div className="min-w-0">
        {alert.kind === "failing" ? (
          <>
            <p className="font-bold">{HEADLINE[alert.status]}</p>
            <p className="mt-0.5">
              Failing since {dateTime(alert.since)}
              {alert.failedRuns > 1 && ` (${alert.failedRuns} runs in a row)`}.
              Last attempt {dateTime(alert.lastAttempt)}
              {alert.error && `: ${alert.error}`}
            </p>
          </>
        ) : (
          <>
            <p className="font-bold">The official feed has stopped running</p>
            <p className="mt-0.5">
              Last run {dateTime(alert.lastRun)}. Check the &ldquo;Official
              feed&rdquo; workflow in GitHub Actions — a wrong CRON_SECRET or a
              paused schedule stops it before it can record an error here.
            </p>
          </>
        )}
        <p className="mt-1 text-xs text-red-800">
          New exam updates are not being posted automatically. Publish the
          important ones from{" "}
          <Link href="/admin/updates" className="font-semibold underline">
            Official Updates
          </Link>{" "}
          until this clears.
        </p>
      </div>
    </div>
  );
}
