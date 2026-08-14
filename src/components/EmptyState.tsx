import Link from "next/link";

/**
 * The one empty-state frame. Both the Exam Hub tabs and the board feed had
 * their own copy of this markup, which is how they drifted apart on padding.
 */
export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  /** Omit when the viewer could not act on it — an invitation they cannot
   *  accept is worse than no invitation. */
  action?: { href: string; label: string };
}) {
  return (
    <div className="rounded-xl border border-dashed border-hairline bg-surface p-8 text-center">
      <p className="font-semibold text-ink">{title}</p>
      <p className="mx-auto mt-1 max-w-md text-sm text-ink-muted">{body}</p>
      {action && (
        <Link
          href={action.href}
          className="mt-4 inline-block rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700"
        >
          {action.label}
        </Link>
      )}
    </div>
  );
}
