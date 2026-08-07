import Link from "next/link";
import clsx from "clsx";
import type { PhaseKind } from "@/prisma/client";
import { PHASE_KIND_LABEL } from "@/lib/phases";

type Phase = {
  id: string;
  slug: string;
  name: string;
  kind: PhaseKind;
  status: { label: string; tone: "live" | "done" | "upcoming" };
};

/**
 * Tier selector for the exam hub.
 *
 * Most exams are several exams in sequence — Tier 1 then Tier 2, CBT 1 then
 * CBT 2 — each with its own dates, key and objection window. Without this,
 * December's Tier 2 discussion would land in the same undifferentiated feed as
 * August's Tier 1, permanently.
 *
 * A link rather than a dropdown so each tier is a real, shareable URL.
 */
export function PhasePicker({
  examSlug,
  phases,
  activeSlug,
}: {
  examSlug: string;
  phases: Phase[];
  activeSlug: string;
}) {
  // A single-phase exam needs no selector.
  if (phases.length <= 1) return null;

  return (
    <nav aria-label="Exam phase" className="no-scrollbar -mx-4 overflow-x-auto px-4">
      <ul className="flex gap-2">
        {phases.map((phase) => {
          const active = phase.slug === activeSlug;
          return (
            <li key={phase.id}>
              <Link
                href={`/exams/${examSlug}?phase=${phase.slug}`}
                aria-current={active ? "page" : undefined}
                title={PHASE_KIND_LABEL[phase.kind]}
                className={clsx(
                  "flex shrink-0 items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold transition",
                  active
                    ? "border-brand-500 bg-brand-50 text-brand-700"
                    : "border-hairline bg-surface text-ink-muted hover:border-brand-300 hover:text-ink"
                )}
              >
                {phase.name}
                <span
                  className={clsx(
                    "rounded-full px-1.5 py-0.5 text-[10px] font-bold",
                    phase.status.tone === "live" && "bg-emerald-100 text-settled",
                    phase.status.tone === "done" && "bg-slate-100 text-ink-muted",
                    phase.status.tone === "upcoming" &&
                      "bg-amber-100 text-amber-700"
                  )}
                >
                  {phase.status.label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
