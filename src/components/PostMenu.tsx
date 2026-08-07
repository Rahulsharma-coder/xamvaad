"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Flag, MoreVertical, Trash2 } from "lucide-react";
import { api } from "@/lib/client";
import { Portal } from "./Portal";

const REASONS = [
  { value: "SPAM", label: "Spam or advertising" },
  { value: "DUPLICATE", label: "Duplicate post" },
  { value: "MISINFORMATION", label: "Misleading or false information" },
  { value: "ABUSE", label: "Abusive or offensive" },
  { value: "OFF_TOPIC", label: "Not related to this exam" },
  { value: "OTHER", label: "Something else" },
] as const;

type Panel = null | "menu" | "report" | "delete";

/**
 * Overflow menu on the post detail header: report someone else's post, or
 * delete your own.
 *
 * Deleting is the author's own action and reporting is about someone else's,
 * so the menu only ever offers the one that applies.
 */
export function PostMenu({
  postId,
  signedIn,
  canDelete,
  backHref,
}: {
  postId: string;
  signedIn: boolean;
  /** Author or staff — the server enforces this again on the request. */
  canDelete: boolean;
  /** Where to send the author once their post is gone. */
  backHref: string;
}) {
  const router = useRouter();
  const [panel, setPanel] = useState<Panel>(null);
  const [reason, setReason] = useState<string>("SPAM");
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Dismiss the dropdown on outside click or Escape.
  useEffect(() => {
    if (panel !== "menu") return;

    function onDown(event: MouseEvent) {
      if (!wrapRef.current?.contains(event.target as Node)) setPanel(null);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setPanel(null);
    }

    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [panel]);

  async function submitReport(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      await api("/api/reports", {
        method: "POST",
        json: { postId, reason, details: details.trim() || undefined },
      });
      setMessage("Thanks — a moderator will review this.");
      setTimeout(() => setPanel(null), 1600);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not send that.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete() {
    setBusy(true);
    setMessage(null);
    try {
      await api(`/api/posts/${postId}`, { method: "DELETE" });
      // Leave the page first: the post it was showing no longer exists.
      router.push(backHref);
      router.refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not delete that.");
      setBusy(false);
    }
  }

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        aria-label="Post options"
        aria-haspopup="menu"
        aria-expanded={panel === "menu"}
        onClick={() =>
          signedIn
            ? setPanel(panel === "menu" ? null : "menu")
            : router.push("/login")
        }
        className="rounded-md p-1 text-ink-muted transition hover:bg-slate-100"
      >
        <MoreVertical size={18} />
      </button>

      {panel === "menu" && (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-1 w-48 overflow-hidden rounded-xl border border-hairline bg-surface py-1 shadow-lg"
        >
          {canDelete ? (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setMessage(null);
                setPanel("delete");
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium text-object transition hover:bg-red-50"
            >
              <Trash2 size={15} />
              Delete post
            </button>
          ) : (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setMessage(null);
                setPanel("report");
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium text-ink transition hover:bg-canvas"
            >
              <Flag size={15} />
              Report post
            </button>
          )}
        </div>
      )}

      {panel === "report" && (
        <Overlay onClose={() => setPanel(null)}>
          <form
            onSubmit={submitReport}
            onClick={(event) => event.stopPropagation()}
            className="w-full max-w-sm rounded-2xl bg-surface p-5 shadow-xl"
          >
            <h2 className="text-base font-bold text-ink">Report this post</h2>
            <p className="mt-1 text-xs text-ink-muted">
              Reports are anonymous to the author.
            </p>

            <fieldset className="mt-3 space-y-1.5">
              <legend className="sr-only">Reason</legend>
              {REASONS.map((option) => (
                <label
                  key={option.value}
                  className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition hover:bg-canvas"
                >
                  <input
                    type="radio"
                    name="reason"
                    value={option.value}
                    checked={reason === option.value}
                    onChange={() => setReason(option.value)}
                    className="accent-brand-600"
                  />
                  {option.label}
                </label>
              ))}
            </fieldset>

            <textarea
              value={details}
              onChange={(event) => setDetails(event.target.value)}
              rows={2}
              maxLength={1000}
              placeholder="Anything else we should know? (optional)"
              className="mt-3 w-full resize-y rounded-lg border border-hairline bg-canvas px-3 py-2 text-sm outline-none focus:border-brand-400 focus:bg-surface"
            />

            {message && (
              <p role="status" className="mt-2 text-xs text-ink-muted">
                {message}
              </p>
            )}

            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setPanel(null)}
                className="flex-1 rounded-lg border border-hairline px-3 py-2 text-sm font-semibold text-ink transition hover:bg-canvas"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busy}
                className="flex-1 rounded-lg bg-object px-3 py-2 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-60"
              >
                {busy ? "Sending..." : "Report"}
              </button>
            </div>
          </form>
        </Overlay>
      )}

      {panel === "delete" && (
        <Overlay onClose={() => (busy ? undefined : setPanel(null))}>
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-post-title"
            onClick={(event) => event.stopPropagation()}
            className="w-full max-w-sm rounded-2xl bg-surface p-5 shadow-xl"
          >
            <h2 id="delete-post-title" className="text-base font-bold text-ink">
              Delete this post?
            </h2>
            <p className="mt-2 text-sm text-ink-muted">
              It will be removed from every feed, along with its comments and
              votes. This can&apos;t be undone.
            </p>

            {message && (
              <p role="alert" className="mt-2 text-xs text-object">
                {message}
              </p>
            )}

            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setPanel(null)}
                disabled={busy}
                className="flex-1 rounded-lg border border-hairline px-3 py-2 text-sm font-semibold text-ink transition hover:bg-canvas disabled:opacity-60"
              >
                Keep it
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                disabled={busy}
                className="flex-1 rounded-lg bg-object px-3 py-2 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-60"
              >
                {busy ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </Overlay>
      )}
    </div>
  );
}

/**
 * Full-screen backdrop, portalled to <body>.
 *
 * Without the portal it inherits the sticky header's backdrop-filter as its
 * containing block and renders clipped inside the header bar.
 */
function Overlay({
  children,
  onClose,
}: {
  children: React.ReactNode;
  onClose: () => void;
}) {
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    // Stop the page scrolling behind the dialog.
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  return (
    <Portal>
      <div
        className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-900/40 p-4 sm:items-center"
        onClick={onClose}
      >
        {children}
      </div>
    </Portal>
  );
}
