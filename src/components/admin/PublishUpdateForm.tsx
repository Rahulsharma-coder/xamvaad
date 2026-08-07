"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Megaphone } from "lucide-react";
import { api } from "@/lib/client";
import { Field, inputClass } from "./ui";

/**
 * Publishing an Official Update.
 *
 * One action does all three things: creates the pinned post, tags it, and
 * notifies everyone active in that exam. Splitting them across screens is how
 * an announcement ends up published but undelivered.
 */
export function PublishUpdateForm({
  exams,
  defaultExamId,
}: {
  exams: { id: string; name: string }[];
  defaultExamId?: string;
}) {
  const router = useRouter();
  const [examId, setExamId] = useState(defaultExamId ?? exams[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [notify, setNotify] = useState(true);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const data = await api<{ id: string; notified: number }>(
        "/api/admin/updates",
        { method: "POST", json: { examId, title, body, notify } }
      );
      setResult(
        `Published. ${data.notified} aspirant${data.notified === 1 ? "" : "s"} notified.`
      );
      setTitle("");
      setBody("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not publish.");
    } finally {
      setBusy(false);
    }
  }

  if (exams.length === 0) {
    return (
      <p className="text-sm text-ink-muted">
        No active exams to publish against.
      </p>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <Field label="Exam">
        <select
          value={examId}
          onChange={(e) => setExamId(e.target.value)}
          className={inputClass}
        >
          {exams.map((exam) => (
            <option key={exam.id} value={exam.id}>
              {exam.name}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Headline">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          minLength={10}
          maxLength={160}
          placeholder="Provisional answer key released for Tier 1"
          className={inputClass}
        />
      </Field>

      <Field label="Details">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          required
          minLength={20}
          maxLength={10_000}
          rows={6}
          placeholder="What changed, where to find it, and what candidates should do next."
          className={inputClass}
        />
      </Field>

      <label className="flex items-start gap-2 text-xs text-ink-muted">
        <input
          type="checkbox"
          checked={notify}
          onChange={(e) => setNotify(e.target.checked)}
          className="mt-0.5 accent-brand-600"
        />
        <span>
          Notify everyone who has taken part in this exam. Leave unticked for a
          correction you don&apos;t want to alert people about twice.
        </span>
      </label>

      {result && <p className="text-xs font-medium text-settled">{result}</p>}
      {error && <p className="text-xs font-medium text-object">{error}</p>}

      <button
        type="submit"
        disabled={busy || title.length < 10 || body.length < 20}
        className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-50"
      >
        {busy ? (
          <Loader2 size={15} className="animate-spin" />
        ) : (
          <Megaphone size={15} />
        )}
        {busy ? "Publishing..." : "Publish update"}
      </button>
    </form>
  );
}
