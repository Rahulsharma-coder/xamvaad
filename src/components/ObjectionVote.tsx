"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { MessageSquare, ThumbsUp, X } from "lucide-react";
import clsx from "clsx";
import { api } from "@/lib/client";
import { ObjectionMeter } from "./ObjectionMeter";
import { Portal } from "./Portal";
import type { ObjectionLevel } from "@/lib/rules";

type Stance = "OBJECT" | "CORRECT";

type VoteResult = {
  objectVotes: number;
  correctVotes: number;
  totalVotes: number;
  percent: number;
  level: ObjectionLevel;
  myStance: Stance;
};

/**
 * "Raise Objection" flow — the buttons on wireframe 09, the confirmation
 * dialog on wireframe 10, and the voted state on wireframe 11.
 */
export function ObjectionVote({
  questionId,
  questionNumber,
  officialAnswer,
  objectVotes: initialObject,
  correctVotes: initialCorrect,
  myStance: initialStance,
  signedIn,
  isResolved,
  heading,
}: {
  questionId: string;
  questionNumber: number;
  officialAnswer: string | null;
  objectVotes: number;
  correctVotes: number;
  myStance: Stance | null;
  signedIn: boolean;
  isResolved: boolean;
  /** Defaults to "Community Opinion" (the tracker wording). */
  heading?: string;
}) {
  const router = useRouter();
  const [counts, setCounts] = useState({
    objectVotes: initialObject,
    correctVotes: initialCorrect,
  });
  const [stance, setStance] = useState<Stance | null>(initialStance);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(next: Stance) {
    if (!signedIn) {
      router.push("/login");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await api<VoteResult>(`/api/questions/${questionId}/vote`, {
        method: "POST",
        json: { stance: next },
      });
      setCounts({
        objectVotes: result.objectVotes,
        correctVotes: result.correctVotes,
      });
      setStance(result.myStance);
      setDialogOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not record your vote.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-xl border border-hairline bg-surface p-4">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-bold text-ink">
          {heading ?? "Community Opinion"}
        </h3>
        <span className="text-xs text-ink-muted">
          {counts.objectVotes + counts.correctVotes === 1
            ? "1 vote"
            : `${counts.objectVotes + counts.correctVotes} votes`}
        </span>
      </div>

      <ObjectionMeter
        objectVotes={counts.objectVotes}
        correctVotes={counts.correctVotes}
      />

      {isResolved ? (
        <p className="mt-4 rounded-lg bg-slate-100 px-3 py-2 text-xs text-ink-muted">
          The final answer key is out for this question, so voting has closed.
        </p>
      ) : (
        <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => (stance === "OBJECT" ? undefined : setDialogOpen(true))}
            disabled={busy || stance === "OBJECT"}
            className={clsx(
              "inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-semibold transition",
              stance === "OBJECT"
                ? "cursor-default bg-slate-100 text-ink-muted"
                : "bg-object text-white hover:bg-red-700"
            )}
          >
            <ThumbsUp size={16} strokeWidth={2.3} />
            {stance === "OBJECT" ? "You Raised Objection" : "Raise Objection"}
          </button>

          <button
            type="button"
            onClick={() => submit("CORRECT")}
            disabled={busy || stance === "CORRECT"}
            className={clsx(
              "inline-flex items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-semibold transition",
              stance === "CORRECT"
                ? "cursor-default border-settled bg-emerald-50 text-settled"
                : "border-hairline text-ink hover:bg-slate-50"
            )}
          >
            <MessageSquare size={16} strokeWidth={2.3} />
            {stance === "CORRECT" ? "You said it's correct" : "Answer is Correct"}
          </button>
        </div>
      )}

      {stance && !isResolved && (
        <p className="mt-2 text-center text-xs text-ink-muted">
          You can change your vote at any time. Your vote is anonymous.
        </p>
      )}

      {error && (
        <p role="alert" className="mt-2 text-xs text-object">
          {error}
        </p>
      )}

      {dialogOpen && (
        <ConfirmDialog
          questionNumber={questionNumber}
          officialAnswer={officialAnswer}
          busy={busy}
          onConfirm={() => submit("OBJECT")}
          onDecline={() => submit("CORRECT")}
          onClose={() => setDialogOpen(false)}
        />
      )}
    </section>
  );
}

/** Wireframe 10 — the confirmation modal. */
function ConfirmDialog({
  questionNumber,
  officialAnswer,
  busy,
  onConfirm,
  onDecline,
  onClose,
}: {
  questionNumber: number;
  officialAnswer: string | null;
  busy: boolean;
  onConfirm: () => void;
  onDecline: () => void;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);

  // Escape closes, and focus moves into the dialog on open.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    dialogRef.current?.focus();
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <Portal>
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-900/40 p-4 sm:items-center"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="objection-dialog-title"
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-sm rounded-2xl bg-surface p-5 shadow-xl outline-none"
      >
        <div className="flex items-start justify-between gap-4">
          <h2
            id="objection-dialog-title"
            className="text-base font-bold text-ink"
          >
            Raise Objection
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1 text-ink-muted transition hover:bg-slate-100"
          >
            <X size={18} />
          </button>
        </div>

        <p className="mt-3 text-sm text-ink">
          Do you believe this answer should be challenged?
        </p>

        <dl className="mt-3 rounded-lg bg-canvas px-3 py-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-ink-muted">Question</dt>
            <dd className="font-semibold text-ink">{questionNumber}</dd>
          </div>
          <div className="mt-1 flex justify-between">
            <dt className="text-ink-muted">Official Answer</dt>
            <dd className="font-semibold text-ink">{officialAnswer ?? "—"}</dd>
          </div>
        </dl>

        <div className="mt-4 space-y-2">
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-object px-3 py-2.5 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-60"
          >
            <ThumbsUp size={16} strokeWidth={2.3} />
            {busy ? "Recording..." : "Yes, Raise Objection"}
          </button>
          <button
            type="button"
            onClick={onDecline}
            disabled={busy}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-hairline px-3 py-2.5 text-sm font-semibold text-ink transition hover:bg-slate-50 disabled:opacity-60"
          >
            <MessageSquare size={16} strokeWidth={2.3} />
            No, Answer is Correct
          </button>
        </div>

        <p className="mt-3 text-center text-xs text-ink-muted">
          Your vote is anonymous
        </p>
      </div>
    </div>
    </Portal>
  );
}
