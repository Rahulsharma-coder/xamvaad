"use client";

import { useState } from "react";
import clsx from "clsx";
import { api } from "@/lib/client";
import {
  CATEGORY_LABEL,
  CUTOFF_BASIS,
  CUTOFF_MAX_MARKS,
  EXAM_CATEGORIES,
  type CutoffBasisKey,
  type ExamCategoryKey,
} from "@/lib/rules";

type Summary = { median: number; min: number; max: number; count: number };

type CutoffState = {
  community: Record<string, Summary | null>;
  totalEstimates: number;
  myEstimate: { category: ExamCategoryKey; marks: number } | null;
};

/**
 * Expected Cutoff card.
 *
 * One table: the author's prediction per category beside the community median
 * and range. An Expected Cutoff post is pure numbers, and prose was destroying
 * them — nobody could compare two posts, let alone aggregate ten.
 */
export function CutoffBlock({
  postId,
  predictions,
  basis,
  initial,
  signedIn,
}: {
  postId: string;
  predictions: { category: ExamCategoryKey; marks: number }[];
  basis: CutoffBasisKey | null;
  initial: CutoffState;
  signedIn: boolean;
}) {
  const [state, setState] = useState(initial);
  const [category, setCategory] = useState<ExamCategoryKey>(
    initial.myEstimate?.category ?? "GENERAL"
  );
  const [marks, setMarks] = useState(
    initial.myEstimate ? String(initial.myEstimate.marks) : ""
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const authorBy = new Map(predictions.map((p) => [p.category, p.marks]));

  // Only show rows someone has data for, so the table never pads itself out
  // with four empty categories.
  const rows = EXAM_CATEGORIES.filter(
    (c) => authorBy.has(c) || state.community[c]
  );

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const value = Number(marks);
    if (!Number.isFinite(value) || value < 0 || value > CUTOFF_MAX_MARKS) {
      setError("Enter a valid mark.");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      setState(
        await api<CutoffState>(`/api/posts/${postId}/cutoff`, {
          method: "POST",
          json: { category, marks: value },
        })
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save that.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="overflow-hidden rounded-xl border border-hairline bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-hairline px-4 py-3">
        <h3 className="text-sm font-bold text-ink">Expected cutoff</h3>
        {basis && (
          <span
            className="text-xs text-ink-muted"
            title={CUTOFF_BASIS[basis].hint}
          >
            {CUTOFF_BASIS[basis].label}
          </span>
        )}
      </div>

      {/* Posts written before the structured form have no predictions and no
          estimates yet — show an invitation rather than an empty table. */}
      {rows.length === 0 ? (
        <p className="px-4 py-4 text-sm text-ink-muted">
          No figures yet. Add the first estimate below.
        </p>
      ) : (
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-hairline text-left text-xs text-ink-muted">
              <th scope="col" className="px-4 py-2 font-semibold">
                Category
              </th>
              <th scope="col" className="px-3 py-2 text-right font-semibold">
                Author
              </th>
              <th scope="col" className="px-3 py-2 text-right font-semibold">
                Community
              </th>
              <th scope="col" className="px-4 py-2 text-right font-semibold">
                You
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((cat) => {
              const author = authorBy.get(cat);
              const community = state.community[cat];
              const mine =
                state.myEstimate?.category === cat
                  ? state.myEstimate.marks
                  : null;

              return (
                <tr key={cat} className="border-b border-hairline last:border-0">
                  <th
                    scope="row"
                    className="px-4 py-2.5 text-left font-semibold text-ink"
                  >
                    {CATEGORY_LABEL[cat]}
                  </th>

                  <td className="px-3 py-2.5 text-right tabular-nums text-ink">
                    {author ?? <span className="text-ink-muted">—</span>}
                  </td>

                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {community ? (
                      <>
                        <span className="font-semibold text-ink">
                          {community.median}
                        </span>
                        {community.min !== community.max && (
                          <span className="ml-1 text-xs text-ink-muted">
                            ({community.min}–{community.max})
                          </span>
                        )}
                      </>
                    ) : (
                      <span className="text-ink-muted">—</span>
                    )}
                  </td>

                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {mine !== null ? (
                      <span className="font-semibold text-brand-700">{mine}</span>
                    ) : (
                      <span className="text-ink-muted">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      )}

      <div className="border-t border-hairline px-4 py-3">
        {signedIn ? (
          <form onSubmit={submit} className="flex flex-wrap items-end gap-2">
            <div>
              <label
                htmlFor="cutoff-category"
                className="mb-1 block text-xs font-semibold text-ink"
              >
                Your category
              </label>
              <select
                id="cutoff-category"
                value={category}
                onChange={(e) => setCategory(e.target.value as ExamCategoryKey)}
                className="rounded-lg border border-hairline bg-canvas px-2.5 py-2 text-sm outline-none focus:border-brand-400 focus:bg-surface"
              >
                {EXAM_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {CATEGORY_LABEL[c]}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="cutoff-marks"
                className="mb-1 block text-xs font-semibold text-ink"
              >
                Your estimate
              </label>
              <input
                id="cutoff-marks"
                type="number"
                inputMode="decimal"
                step="0.25"
                min={0}
                max={CUTOFF_MAX_MARKS}
                value={marks}
                onChange={(e) => setMarks(e.target.value)}
                placeholder="e.g. 148"
                required
                className="w-28 rounded-lg border border-hairline bg-canvas px-3 py-2 text-sm tabular-nums outline-none focus:border-brand-400 focus:bg-surface"
              />
            </div>

            <button
              type="submit"
              disabled={busy || !marks}
              className={clsx(
                "rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-50"
              )}
            >
              {busy
                ? "Saving..."
                : state.myEstimate
                  ? "Update"
                  : "Add estimate"}
            </button>
          </form>
        ) : (
          <p className="text-sm text-ink-muted">
            Sign in to add your own estimate.
          </p>
        )}

        {error && (
          <p role="alert" className="mt-2 text-xs text-object">
            {error}
          </p>
        )}

        <p className="mt-2 text-xs text-ink-muted">
          {state.totalEstimates === 0
            ? "No community estimates yet."
            : `Median of ${
                state.totalEstimates === 1
                  ? "1 estimate"
                  : `${state.totalEstimates} estimates`
              }. Community figures are aspirant predictions, not official cutoffs.`}
        </p>
      </div>
    </section>
  );
}
