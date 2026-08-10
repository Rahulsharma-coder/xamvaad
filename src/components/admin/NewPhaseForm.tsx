"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus } from "lucide-react";
import { api } from "@/lib/client";
import { Field, inputClass } from "./ui";
import { PHASE_KIND_LABEL, PHASE_PRESETS } from "@/lib/phases";
import type { PhaseKind } from "@/prisma/client";

const KINDS: PhaseKind[] = [
  "WRITTEN",
  "SKILL_TEST",
  "PHYSICAL",
  "INTERVIEW",
  "DOCUMENT_VERIFICATION",
];

const PRESETS = PHASE_PRESETS;

/**
 * Position is deliberately absent: the server appends to the end. The form
 * cannot know the next free slot without reasoning about deleted phases, and
 * getting it wrong produced an error naming a number the admin never chose.
 */
export function NewPhaseForm({ examId }: { examId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [shortName, setShortName] = useState("");
  const [kind, setKind] = useState<PhaseKind>("WRITTEN");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function applyPreset(preset: (typeof PRESETS)[number]) {
    setName(preset.name);
    setShortName(preset.short);
    setKind(preset.kind);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/api/admin/phases", {
        method: "POST",
        // No slug and no position: the API derives both. Sending either meant
        // the form could fail validation on a field it never showed.
        json: { examId, name, shortName, kind },
      });
      setName("");
      setShortName("");
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add the phase.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-brand-700"
      >
        <Plus size={14} />
        Add phase
      </button>
    );
  }

  return (
    <form
      onSubmit={submit}
      className="w-full rounded-xl border border-hairline bg-surface p-4"
    >
      <h3 className="text-sm font-bold text-ink">Add a phase</h3>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {PRESETS.map((preset) => (
          <button
            key={preset.name}
            type="button"
            onClick={() => applyPreset(preset)}
            className="rounded-full border border-hairline px-2.5 py-1 text-[11px] font-semibold text-ink-muted transition hover:border-brand-300 hover:text-ink"
          >
            {preset.name}
          </button>
        ))}
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <Field label="Name">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={60}
            placeholder="Tier 2"
            className={inputClass}
          />
        </Field>
        <Field label="Short name">
          <input
            value={shortName}
            onChange={(e) => setShortName(e.target.value)}
            required
            maxLength={20}
            placeholder="T2"
            className={inputClass}
          />
        </Field>
        <Field label="Kind">
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as PhaseKind)}
            className={inputClass}
          >
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {PHASE_KIND_LABEL[k]}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <p className="mt-2 text-[11px] text-ink-muted">
        Only a written test gets an answer key, an objection window and a
        tracker. Its five lifecycle stages start as TBA.
      </p>

      {error && <p className="mt-2 text-xs text-object">{error}</p>}

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-lg border border-hairline px-3 py-2 text-xs font-semibold text-ink"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={busy || !name || !shortName}
          className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
        >
          {busy && <Loader2 size={13} className="animate-spin" />}
          Add phase
        </button>
      </div>
    </form>
  );
}
