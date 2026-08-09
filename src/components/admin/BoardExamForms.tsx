"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus } from "lucide-react";
import { api, ApiClientError } from "@/lib/client";
import { Field, inputClass } from "./ui";
import { useSelectedId } from "./useSelectedId";

/** Slugs are derived from the name so admins don't hand-craft URL strings. */
function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

export function NewBoardForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [fullName, setFullName] = useState("");
  const [color, setColor] = useState("#4F46E5");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/api/admin/boards", {
        method: "POST",
        json: { slug: slugify(name), name, fullName, color },
      });
      setName("");
      setFullName("");
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create it.");
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
        New board
      </button>
    );
  }

  return (
    <form
      onSubmit={submit}
      className="rounded-xl border border-hairline bg-surface p-4"
    >
      <h3 className="text-sm font-bold text-ink">New board</h3>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Field label="Short name" hint="Shown on chips, e.g. SSC">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={40}
            className={inputClass}
          />
        </Field>
        <Field label="Full name">
          <input
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            required
            maxLength={120}
            placeholder="Staff Selection Commission"
            className={inputClass}
          />
        </Field>
        <Field label="Accent colour">
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className="h-9 w-full rounded-lg border border-hairline bg-canvas"
          />
        </Field>
        <Field label="URL slug" hint="Generated from the short name">
          <input value={slugify(name)} readOnly className={`${inputClass} text-ink-muted`} />
        </Field>
      </div>

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
          disabled={busy || !name || !fullName}
          className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
        >
          {busy && <Loader2 size={13} className="animate-spin" />}
          Create board
        </button>
      </div>
    </form>
  );
}

export function NewExamForm({
  boards,
}: {
  boards: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [boardId, setBoardId] = useSelectedId(boards);
  const [name, setName] = useState("");
  const [shortName, setShortName] = useState("");
  const [year, setYear] = useState(new Date().getFullYear());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setFieldErrors({});
    try {
      await api("/api/admin/exams", {
        method: "POST",
        json: { boardId, slug: slugify(name), name, shortName, year },
      });
      setName("");
      setShortName("");
      setOpen(false);
      router.refresh();
    } catch (err) {
      // "Validation failed" on its own tells the admin nothing. The API sends
      // the offending fields alongside it; surface them.
      if (err instanceof ApiClientError && err.details) {
        setFieldErrors(err.details as Record<string, string[]>);
      }
      setError(err instanceof Error ? err.message : "Could not create it.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={boards.length === 0}
        className="inline-flex items-center gap-1.5 rounded-lg border border-hairline bg-surface px-3 py-2 text-xs font-semibold text-ink transition hover:bg-canvas disabled:opacity-50"
      >
        <Plus size={14} />
        New exam
      </button>
    );
  }

  return (
    <form
      onSubmit={submit}
      className="rounded-xl border border-hairline bg-surface p-4"
    >
      <h3 className="text-sm font-bold text-ink">New exam</h3>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Field label="Board">
          <select
            value={boardId}
            onChange={(e) => setBoardId(e.target.value)}
            className={inputClass}
          >
            {boards.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Name" hint="e.g. SSC CGL 2026">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            minLength={3}
            maxLength={120}
            className={inputClass}
          />
        </Field>
        <Field label="Short name" hint="Used in tags, e.g. CGL">
          <input
            value={shortName}
            onChange={(e) => setShortName(e.target.value)}
            required
            maxLength={20}
            className={inputClass}
          />
        </Field>
        <Field label="Year">
          <input
            type="number"
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            min={2000}
            max={2100}
            className={inputClass}
          />
        </Field>
      </div>

      <p className="mt-2 text-[11px] text-ink-muted">
        The five lifecycle stages are created as TBA. Set their dates from Exam
        Operations.
      </p>

      {error && <p className="mt-2 text-xs text-object">{error}</p>}
      {Object.entries(fieldErrors).map(([field, messages]) => (
        <p key={field} className="mt-1 text-xs text-object">
          <span className="font-semibold capitalize">
            {field.replace(/([A-Z])/g, " $1").toLowerCase()}
          </span>
          : {messages.join("; ")}
        </p>
      ))}

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
          Create exam
        </button>
      </div>
    </form>
  );
}
