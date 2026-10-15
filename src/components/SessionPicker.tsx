"use client";

import { useRouter, usePathname } from "next/navigation";

/**
 * The "Change" control on the exam hub — switches date/shift (wireframe 04).
 *
 * "All shifts" comes first and is the default: the hub opens on everything in
 * the tier, and a single sitting is a narrowing the reader chooses.
 */
export function SessionPicker({
  sessions,
  activeId,
  tab,
  phaseSlug,
}: {
  sessions: { id: string; label: string }[];
  activeId: string | null;
  tab: string;
  /** Kept in the URL, or choosing a Tier 2 shift would land back on Tier 1. */
  phaseSlug: string;
}) {
  const router = useRouter();
  const pathname = usePathname();

  return (
    <label className="flex items-center gap-2">
      <span className="sr-only">Choose exam date and shift</span>
      <select
        value={activeId ?? ""}
        onChange={(event) => {
          const params = new URLSearchParams({ tab, phase: phaseSlug });
          if (event.target.value) params.set("sessionId", event.target.value);
          router.push(`${pathname}?${params}`);
        }}
        className="rounded-lg border border-hairline bg-surface px-2.5 py-1.5 text-xs font-semibold text-ink outline-none transition focus:border-brand-400"
      >
        <option value="">All shifts</option>
        {sessions.map((session) => (
          <option key={session.id} value={session.id}>
            {session.label}
          </option>
        ))}
      </select>
    </label>
  );
}
