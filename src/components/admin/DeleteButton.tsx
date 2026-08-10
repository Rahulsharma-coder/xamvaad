"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2 } from "lucide-react";
import { api } from "@/lib/client";

/**
 * Two-step delete for boards, exams and phases.
 *
 * The first click arms it and the second confirms, rather than a browser
 * `confirm()` dialog: these actions cascade, and a dialog you dismiss by
 * reflex is not a safeguard. The armed state names the thing being deleted so
 * the second click is about a specific board, not "the delete button".
 *
 * The server refuses anything that holds content, so the worst outcome here is
 * a readable 409 rather than lost posts — which is why this doesn't demand the
 * admin type the name out.
 */
export function DeleteButton({
  endpoint,
  label,
  redirectTo,
  className,
}: {
  endpoint: string;
  /** What is being deleted, shown while armed: "Delete SSC?" */
  label: string;
  /**
   * Where to go afterwards. Needed when the button sits on the deleted thing's
   * own page — refreshing an exam page whose exam is gone renders a 404 and
   * leaves the admin wondering whether it worked.
   */
  redirectTo?: string;
  className?: string;
}) {
  const router = useRouter();
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      await api(endpoint, { method: "DELETE" });
      setArmed(false);
      if (redirectTo) router.push(redirectTo);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete it.");
      setArmed(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className={className}>
      {armed ? (
        <span className="inline-flex items-center gap-1.5">
          <span className="text-[11px] font-semibold text-ink">
            Delete {label}?
          </span>
          <button
            type="button"
            onClick={remove}
            disabled={busy}
            className="inline-flex items-center gap-1 rounded-lg bg-object px-2.5 py-1.5 text-[11px] font-semibold text-white transition hover:bg-red-700 disabled:opacity-60"
          >
            {busy && <Loader2 size={12} className="animate-spin" />}
            Yes, delete
          </button>
          <button
            type="button"
            onClick={() => setArmed(false)}
            disabled={busy}
            className="rounded-lg border border-hairline px-2.5 py-1.5 text-[11px] font-semibold text-ink-muted transition hover:text-ink"
          >
            Cancel
          </button>
        </span>
      ) : (
        <button
          type="button"
          onClick={() => {
            setArmed(true);
            setError(null);
          }}
          title={`Delete ${label}`}
          className="inline-flex items-center gap-1.5 rounded-lg border border-hairline px-2.5 py-1.5 text-[11px] font-semibold text-ink-muted transition hover:border-red-300 hover:bg-red-50 hover:text-object"
        >
          <Trash2 size={13} />
          Delete
        </button>
      )}

      {/* Kept next to the button: the refusals explain what to do instead, and
          they are the whole point of this being safe to click. */}
      {error && (
        <p role="alert" className="mt-1.5 max-w-sm text-[11px] leading-tight text-object">
          {error}
        </p>
      )}
    </span>
  );
}
