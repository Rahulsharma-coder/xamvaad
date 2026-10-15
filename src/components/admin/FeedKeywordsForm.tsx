"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { api } from "@/lib/client";
import { Field, inputClass } from "./ui";

/**
 * The phrases that pick this exam out of the Sarkari Result feed, one per
 * line. Shown as a textarea rather than chips because the list is short and
 * the admin is usually pasting a phrase straight from a feed title.
 */
export function FeedKeywordsForm({
  examId,
  initial,
}: {
  examId: string;
  initial: string[];
}) {
  const router = useRouter();
  const [text, setText] = useState(initial.join("\n"));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const phrases = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const dirty = phrases.join("\n") !== initial.join("\n");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const result = await api<{ feedKeywords: string[] }>(
        `/api/admin/exams/${examId}`,
        { method: "PATCH", json: { feedKeywords: phrases } }
      );
      setText(result.feedKeywords.join("\n"));
      setSaved(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the keywords.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <Field
        label="Sarkari Result keywords"
        hint='One phrase per line, e.g. "SSC CGL". A feed title that contains one as whole words is announced here automatically in Hindi. Start a line with "-" to rule the exam out ("-Mains"). Leave empty to never auto-announce.'
      >
        <textarea
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setSaved(false);
          }}
          rows={4}
          placeholder={"SSC CGL\nSSC Combined Graduate Level"}
          className={inputClass}
        />
      </Field>

      {error && <p className="mt-2 text-xs text-object">{error}</p>}

      <div className="mt-3 flex items-center gap-3">
        <button
          type="submit"
          disabled={busy || !dirty}
          className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
        >
          {busy && <Loader2 size={13} className="animate-spin" />}
          Save keywords
        </button>
        {saved && !dirty && (
          <span className="text-xs font-semibold text-settled">Saved</span>
        )}
      </div>
    </form>
  );
}
