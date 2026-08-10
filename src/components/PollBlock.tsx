"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import clsx from "clsx";
import { api } from "@/lib/client";
import { compactCount } from "@/lib/format";

type Option = { id: string; label: string; text?: string | null; voteCount: number };

/**
 * Poll view (wireframe 06) and its post-vote state (wireframe 11).
 *
 * Results stay hidden until the viewer votes — seeing the tally first would
 * bias the answer, which defeats the point of asking the shift what it marked.
 */
export function PollBlock({
  pollId,
  question,
  options: initialOptions,
  votedOptionId: initialVoted,
  signedIn,
  closesAt,
}: {
  pollId: string;
  question: string;
  options: Option[];
  votedOptionId: string | null;
  signedIn: boolean;
  closesAt?: Date | string | null;
}) {
  const router = useRouter();
  const [options, setOptions] = useState(initialOptions);
  const [votedOptionId, setVotedOptionId] = useState(initialVoted);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const closed = closesAt ? new Date(closesAt) < new Date() : false;
  const total = options.reduce((sum, o) => sum + o.voteCount, 0);
  const revealed = Boolean(votedOptionId) || closed;
  const leaderCount = Math.max(...options.map((o) => o.voteCount), 0);

  async function vote(optionId: string) {
    if (!signedIn) {
      router.push("/login");
      return;
    }
    if (closed) return;

    setPending(optionId);
    setError(null);
    try {
      const result = await api<{ options: Option[]; votedOptionId: string }>(
        `/api/polls/${pollId}/vote`,
        { method: "POST", json: { optionId } }
      );
      setOptions((prev) =>
        prev.map((o) => ({
          ...o,
          voteCount:
            result.options.find((r) => r.id === o.id)?.voteCount ?? o.voteCount,
        }))
      );
      setVotedOptionId(result.votedOptionId);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not record your vote.");
    } finally {
      setPending(null);
    }
  }

  return (
    <section
      aria-label="Poll"
      className="rounded-xl border border-hairline bg-surface p-4"
    >
      <h3 className="text-sm font-semibold text-ink">{question}</h3>

      <ul className="mt-3 space-y-2">
        {options.map((option) => {
          const percent = total ? Math.round((option.voteCount / total) * 100) : 0;
          const isMine = option.id === votedOptionId;
          const isLeader = revealed && option.voteCount === leaderCount && total > 0;

          return (
            <li key={option.id}>
              <button
                type="button"
                onClick={() => vote(option.id)}
                disabled={pending !== null || closed}
                aria-pressed={isMine}
                className={clsx(
                  "relative w-full overflow-hidden rounded-lg border px-3 py-2.5 text-left transition disabled:cursor-not-allowed",
                  isMine
                    ? "border-settled bg-emerald-50/40"
                    : "border-hairline hover:border-brand-300 hover:bg-brand-50/40"
                )}
              >
                {/* Result bar sits behind the label once results are revealed. */}
                {revealed && (
                  <span
                    aria-hidden="true"
                    className={clsx(
                      "absolute inset-y-0 left-0 transition-all",
                      isMine ? "bg-emerald-100" : "bg-slate-100"
                    )}
                    style={{ width: `${percent}%` }}
                  />
                )}

                <span className="relative flex items-center justify-between gap-3">
                  <span className="flex min-w-0 items-center gap-2 text-sm font-medium text-ink">
                    {/* Two shapes share this component. A Memory Question puts
                        the letter in `label` and the answer in `text`, so the
                        letter gets a badge. A poll puts the whole answer in
                        `label` and leaves `text` null — badging that squeezed
                        "Reasoning" into a 24px box, where the button's
                        overflow-hidden clipped the first letter off. */}
                    {option.text ? (
                      <>
                        <span
                          className={clsx(
                            "flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-xs font-bold",
                            isMine
                              ? "bg-settled text-white"
                              : "bg-slate-100 text-ink-muted"
                          )}
                        >
                          {option.label}
                        </span>
                        <span className="min-w-0 break-words">{option.text}</span>
                      </>
                    ) : (
                      <span className="min-w-0 break-words">{option.label}</span>
                    )}
                  </span>

                  {revealed && (
                    <span className="flex shrink-0 items-center gap-1.5 text-xs font-semibold text-ink-muted">
                      {isLeader && <Check size={14} className="text-settled" />}
                      {percent}%
                      <span className="font-normal">
                        ({compactCount(option.voteCount)})
                      </span>
                    </span>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <p className="mt-3 text-xs text-ink-muted">
        {revealed
          ? `Total votes: ${compactCount(total)}`
          : signedIn
            ? "Vote to see the results."
            : "Sign in to vote and see the results."}
        {closed && " · Closed"}
      </p>

      {error && (
        <p role="alert" className="mt-2 text-xs text-object">
          {error}
        </p>
      )}
    </section>
  );
}
