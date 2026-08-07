import Link from "next/link";
import clsx from "clsx";

export type TabKey = "discussion" | "polls" | "memory" | "updates" | "objections";

const TABS: { key: TabKey; label: string; badge?: string }[] = [
  { key: "discussion", label: "Discussion" },
  { key: "polls", label: "Polls" },
  { key: "memory", label: "Memory Qs" },
  { key: "updates", label: "Updates" },
  { key: "objections", label: "Objection Tracker", badge: "NEW" },
];

/** Exam hub tab rail — wireframe 04. */
export function ExamTabs({
  slug,
  active,
  sessionId,
  phaseSlug,
  showQuestionTabs = true,
}: {
  slug: string;
  active: TabKey;
  sessionId?: string;
  /** Keeps the selected tier when switching tabs. */
  phaseSlug?: string;
  /**
   * False for a phase with no answer key — a Physical Efficiency Test has no
   * questions to remember, poll about or challenge, so those tabs would only
   * ever be empty.
   */
  showQuestionTabs?: boolean;
}) {
  return (
    <nav aria-label="Exam sections" className="border-b border-hairline">
      <ul className="no-scrollbar -mb-px flex gap-1 overflow-x-auto">
        {TABS.filter(
          (tab) =>
            showQuestionTabs ||
            !["polls", "memory", "objections"].includes(tab.key)
        ).map((tab) => {
          const isActive = tab.key === active;
          const href = `/exams/${slug}?tab=${tab.key}${
            phaseSlug ? `&phase=${phaseSlug}` : ""
          }${sessionId ? `&sessionId=${sessionId}` : ""}`;

          return (
            <li key={tab.key} className="shrink-0">
              <Link
                href={href}
                aria-current={isActive ? "page" : undefined}
                className={clsx(
                  "inline-flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-semibold transition",
                  isActive
                    ? "border-brand-600 text-brand-700"
                    : "border-transparent text-ink-muted hover:text-ink"
                )}
              >
                {tab.label}
                {tab.badge && (
                  <span className="rounded bg-object px-1 py-0.5 text-[9px] font-bold text-white">
                    {tab.badge}
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
