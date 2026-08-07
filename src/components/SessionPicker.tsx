"use client";

import { useRouter, usePathname } from "next/navigation";

/** The "Change" control on the exam hub — switches date/shift (wireframe 04). */
export function SessionPicker({
  sessions,
  activeId,
  tab,
}: {
  sessions: { id: string; label: string }[];
  activeId: string | null;
  tab: string;
}) {
  const router = useRouter();
  const pathname = usePathname();

  return (
    <label className="flex items-center gap-2">
      <span className="sr-only">Choose exam date and shift</span>
      <select
        value={activeId ?? ""}
        onChange={(event) =>
          router.push(`${pathname}?tab=${tab}&sessionId=${event.target.value}`)
        }
        className="rounded-lg border border-hairline bg-surface px-2.5 py-1.5 text-xs font-semibold text-ink outline-none transition focus:border-brand-400"
      >
        {sessions.map((session) => (
          <option key={session.id} value={session.id}>
            {session.label}
          </option>
        ))}
      </select>
    </label>
  );
}
