import clsx from "clsx";
import { compactCount } from "@/lib/format";
import {
  OBJECTION_LABEL,
  objectionLevel,
  objectionPercent,
  type ObjectionLevel,
} from "@/lib/rules";

const TONE: Record<ObjectionLevel, { text: string; bar: string; chip: string }> =
  {
    STRONG: {
      text: "text-object",
      bar: "bg-object",
      chip: "bg-object text-white",
    },
    REVIEW: {
      text: "text-review",
      bar: "bg-review",
      chip: "bg-review text-white",
    },
    LOW: {
      text: "text-settled",
      bar: "bg-settled",
      chip: "bg-settled text-white",
    },
    INSUFFICIENT: {
      text: "text-ink-muted",
      bar: "bg-slate-400",
      chip: "bg-slate-200 text-ink-muted",
    },
  };

export function objectionTone(level: ObjectionLevel) {
  return TONE[level];
}

/** The "82% — Strong Objection" pill used in the tracker list (wireframe 08). */
export function ObjectionPill({
  objectVotes,
  correctVotes,
}: {
  objectVotes: number;
  correctVotes: number;
}) {
  const level = objectionLevel(objectVotes, correctVotes);
  const percent = objectionPercent(objectVotes, correctVotes);

  return (
    <span
      className={clsx(
        "inline-flex min-w-14 justify-center rounded-lg px-2.5 py-1 text-sm font-bold",
        TONE[level].chip
      )}
      title={OBJECTION_LABEL[level]}
    >
      {percent}%
    </span>
  );
}

/**
 * The full community-opinion block from the question detail screen
 * (wireframe 09): percentage, verdict label, vote count and a progress bar.
 */
export function ObjectionMeter({
  objectVotes,
  correctVotes,
  showLabel = true,
}: {
  objectVotes: number;
  correctVotes: number;
  showLabel?: boolean;
}) {
  const total = objectVotes + correctVotes;
  const percent = objectionPercent(objectVotes, correctVotes);
  const level = objectionLevel(objectVotes, correctVotes);
  const tone = TONE[level];

  return (
    <div>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className={clsx("text-3xl font-extrabold", tone.text)}>
          {percent}%
        </span>
        {showLabel && (
          <span className={clsx("text-sm font-semibold", tone.text)}>
            {level === "STRONG" ? "Objection Recommended" : OBJECTION_LABEL[level]}
          </span>
        )}
      </div>

      <p className="mt-1 text-xs text-ink-muted">
        {compactCount(total)} {total === 1 ? "vote" : "votes"}
      </p>

      <div
        className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-200"
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Share of voters who believe this answer should be challenged"
      >
        <div
          className={clsx("h-full rounded-full transition-all", tone.bar)}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
