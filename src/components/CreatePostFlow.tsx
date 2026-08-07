"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BarChart3,
  Brain,
  Gavel,
  HelpCircle,
  MessageCircle,
  Plus,
  ShieldCheck,
  TrendingUp,
  X,
  type LucideIcon,
} from "lucide-react";
import clsx from "clsx";
import type { PostType } from "@/prisma/client";
import { api, ApiClientError } from "@/lib/client";
import {
  BODY_MAX,
  CATEGORY_LABEL,
  CUTOFF_BASIS,
  CUTOFF_BASIS_KEYS,
  CUTOFF_MAX_MARKS,
  EXAM_CATEGORIES,
  MAX_MANUAL_TAGS,
  OPTION_LABELS,
  POST_TYPE_OPTIONS,
  RECALL_CONFIDENCE,
  RECALL_CONFIDENCE_KEYS,
  TITLE_MAX,
  isChoiceQuestion,
  isShiftScoped,
  requiresConductedPhase,
  type CutoffBasisKey,
  type RecallConfidenceKey,
} from "@/lib/rules";

type Session = { id: string; label: string };
type Phase = {
  id: string;
  name: string;
  sessions: Session[];
  /** True while this tier's objection window is open. */
  objectionOpen: boolean;
  /** Only a written paper has questions to remember or challenge. */
  hasAnswerKey: boolean;
  /** False until the exam window opens — i.e. until the first shift is sat. */
  conducted: boolean;
};
type Exam = { id: string; name: string; phases: Phase[] };
type Board = { id: string; name: string; exams: Exam[] };

const ICONS: Record<string, LucideIcon> = {
  MessageCircle,
  BarChart3,
  Brain,
  Gavel,
  ShieldCheck,
  HelpCircle,
  TrendingUp,
};

export function CreatePostFlow({
  boards,
  canPostOfficial,
}: {
  boards: Board[];
  canPostOfficial: boolean;
}) {
  const router = useRouter();

  const [type, setType] = useState<PostType | null>(null);
  const [boardId, setBoardId] = useState("");
  const [examId, setExamId] = useState("");
  const [phaseId, setPhaseId] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [tagInput, setTagInput] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [questionNumber, setQuestionNumber] = useState("");
  const [pollOptions, setPollOptions] = useState(["", ""]);
  const [questionOptions, setQuestionOptions] = useState(["", "", "", ""]);
  const [officialAnswer, setOfficialAnswer] = useState<string>("");
  const [subject, setSubject] = useState("");
  const [recallConfidence, setRecallConfidence] =
    useState<RecallConfidenceKey | null>(null);
  const [cutoffMarks, setCutoffMarks] = useState<Record<string, string>>({});
  const [cutoffBasis, setCutoffBasis] = useState<CutoffBasisKey | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  const board = useMemo(
    () => boards.find((b) => b.id === boardId) ?? null,
    [boards, boardId]
  );
  const exam = useMemo(
    () => board?.exams.find((e) => e.id === examId) ?? null,
    [board, examId]
  );
  const phase = useMemo(
    () => exam?.phases.find((p) => p.id === phaseId) ?? null,
    [exam, phaseId]
  );

  // Any tier currently accepting objections. If none are, there is nothing to
  // challenge, so the Objection Question type is not offered at all.
  const objectionPhasesExist = boards.some((b) =>
    b.exams.some((e) => e.phases.some((p) => p.objectionOpen))
  );

  // Nothing to recall, challenge or estimate until some exam has started.
  const conductedPhasesExist = boards.some((b) =>
    b.exams.some((e) => e.phases.some((p) => p.conducted))
  );

  const availableTypes = POST_TYPE_OPTIONS.filter((option) => {
    if (option.value === "OFFICIAL_UPDATE") return canPostOfficial;
    if (option.value === "OBJECTION_QUESTION") return objectionPhasesExist;
    if (requiresConductedPhase(option.value)) return conductedPhasesExist;
    return true;
  });

  // Once Objection Question is chosen, only exams with an open window qualify.
  const examOptions = (board?.exams ?? []).filter((e) => {
    if (type === "OBJECTION_QUESTION") {
      return e.phases.some((p) => p.objectionOpen);
    }
    if (type && requiresConductedPhase(type)) {
      return e.phases.some((p) => p.conducted);
    }
    return true;
  });

  // A Memory or Objection Question needs a written paper; an Objection needs
  // the window open too.
  const phaseOptions = (exam?.phases ?? []).filter((p) => {
    if (type === "OBJECTION_QUESTION") return p.objectionOpen;
    // A paper you haven't sat can't be recalled, and its cutoff can't be
    // estimated — the server enforces this too.
    if (type && requiresConductedPhase(type) && !p.conducted) return false;
    if (type === "MEMORY_QUESTION") return p.hasAnswerKey;
    return true;
  });

  const sessionOptions = phase?.sessions ?? [];

  function addTag() {
    const value = tagInput.trim().replace(/^#/, "");
    if (!value || tags.length >= MAX_MANUAL_TAGS) return;
    if (tags.some((t) => t.toLowerCase() === value.toLowerCase())) {
      setTagInput("");
      return;
    }
    setTags([...tags, value]);
    setTagInput("");
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!type) return;

    setBusy(true);
    setError(null);
    setFieldErrors({});

    try {
      const result = await api<{ id: string }>("/api/posts", {
        method: "POST",
        json: {
          boardId,
          examId,
          phaseId: phaseId || null,
          sessionId: sessionId || null,
          type,
          title: title.trim(),
          body: body.trim(),
          tags,
          questionNumber: questionNumber ? Number(questionNumber) : null,
          questionOptions: isChoiceQuestion(type)
            ? questionOptions.map((o) => o.trim())
            : undefined,
          officialAnswer:
            type === "OBJECTION_QUESTION" ? officialAnswer || undefined : undefined,
          recallConfidence:
            type === "MEMORY_QUESTION" ? recallConfidence ?? undefined : undefined,
          cutoffPredictions:
            type === "EXPECTED_CUTOFF"
              ? EXAM_CATEGORIES.flatMap((cat) => {
                  const raw = cutoffMarks[cat]?.trim();
                  if (!raw) return [];
                  const marks = Number(raw);
                  return Number.isFinite(marks)
                    ? [{ category: cat, marks }]
                    : [];
                })
              : undefined,
          cutoffBasis:
            type === "EXPECTED_CUTOFF" ? cutoffBasis ?? undefined : undefined,
          subject: subject.trim() || undefined,
          pollOptions:
            type === "POLL"
              ? pollOptions
                  .map((label) => ({ label: label.trim() }))
                  .filter((o) => o.label)
              : undefined,
        },
      });
      router.push(`/posts/${result.id}`);
      router.refresh();
    } catch (err) {
      if (err instanceof ApiClientError && err.details) {
        setFieldErrors(err.details as Record<string, string[]>);
      }
      setError(err instanceof Error ? err.message : "Could not publish that.");
    } finally {
      setBusy(false);
    }
  }

  // ---- Step 1: choose the post type (wireframe 12) ------------------------
  if (!type) {
    return (
      <section>
        <h1 className="text-lg font-extrabold text-ink">Create Post</h1>
        <p className="mt-1 text-sm text-ink-muted">Select Post Type</p>

        <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {availableTypes.map((option) => {
            const Icon = ICONS[option.icon] ?? MessageCircle;
            return (
              <li key={option.value}>
                <button
                  type="button"
                  onClick={() => {
                    setType(option.value);
                    // The valid exam list depends on the type, so start clean.
                    setBoardId("");
                    setExamId("");
                    setSessionId("");
                  }}
                  className="flex h-full w-full flex-col items-center gap-2 rounded-xl border border-hairline bg-surface p-4 text-center transition hover:border-brand-400 hover:bg-brand-50/40"
                >
                  <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                    <Icon size={20} strokeWidth={2.2} />
                  </span>
                  <span className="text-sm font-semibold text-ink">
                    {option.title}
                  </span>
                  <span className="text-[11px] leading-tight text-ink-muted">
                    {option.hint}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>
    );
  }

  // ---- Step 2: the form (wireframe 13) ------------------------------------
  const typeLabel = POST_TYPE_OPTIONS.find((o) => o.value === type)!.title;
  const isObjection = type === "OBJECTION_QUESTION";
  const isMemory = type === "MEMORY_QUESTION";
  const isCutoff = type === "EXPECTED_CUTOFF";
  const isChoice = isChoiceQuestion(type);
  const shiftScoped = isShiftScoped(type);
  const isQuestionType = isChoice;

  return (
    <form onSubmit={submit}>
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-lg font-extrabold text-ink">Create {typeLabel}</h1>
        <button
          type="button"
          onClick={() => setType(null)}
          className="text-xs font-semibold text-brand-600 hover:underline"
        >
          Change type
        </button>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-[1fr_260px]">
        {/* Main column */}
        <div className="space-y-3">
          <Labelled
            label={isChoice ? "Question" : "Title"}
            required
            errors={fieldErrors.title}
          >
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={TITLE_MAX}
              placeholder={
                isObjection
                  ? "Type the question exactly as it appeared"
                  : isMemory
                    ? "Type the question as best you remember it"
                    : "Type your title"
              }
              required
              className="w-full rounded-lg border border-hairline bg-canvas px-3 py-2.5 text-sm outline-none transition focus:border-brand-400 focus:bg-surface"
            />
          </Labelled>

          {/* Four lettered choices — Objection and Memory Questions. */}
          {isChoice && (
            <Labelled label="Options" required errors={fieldErrors.questionOptions}>
              <ul className="space-y-2">
                {OPTION_LABELS.map((label, index) => (
                  <li key={label} className="flex items-center gap-2">
                    <span className="w-6 shrink-0 text-sm font-bold text-ink">
                      {label}.
                    </span>
                    <input
                      value={questionOptions[index] ?? ""}
                      onChange={(event) => {
                        const next = [...questionOptions];
                        next[index] = event.target.value;
                        setQuestionOptions(next);
                      }}
                      placeholder={`Option ${label}`}
                      required
                      className="w-full rounded-lg border border-hairline bg-canvas px-3 py-2 text-sm outline-none focus:border-brand-400 focus:bg-surface"
                    />
                  </li>
                ))}
              </ul>
            </Labelled>
          )}

          {/* Predicted marks per category — Expected Cutoff only. */}
          {isCutoff && (
            <Labelled
              label="Predicted cutoff"
              required
              errors={fieldErrors.cutoffPredictions}
            >
              <ul className="space-y-2">
                {EXAM_CATEGORIES.map((cat) => (
                  <li key={cat} className="flex items-center gap-3">
                    <span className="w-20 shrink-0 text-sm font-semibold text-ink">
                      {CATEGORY_LABEL[cat]}
                      {cat === "GENERAL" && (
                        <span className="ml-0.5 text-object">*</span>
                      )}
                    </span>
                    <input
                      type="number"
                      inputMode="decimal"
                      step="0.25"
                      min={0}
                      max={CUTOFF_MAX_MARKS}
                      value={cutoffMarks[cat] ?? ""}
                      onChange={(event) =>
                        setCutoffMarks({
                          ...cutoffMarks,
                          [cat]: event.target.value,
                        })
                      }
                      placeholder={cat === "GENERAL" ? "e.g. 148" : "optional"}
                      className="w-32 rounded-lg border border-hairline bg-canvas px-3 py-2 text-sm tabular-nums outline-none focus:border-brand-400 focus:bg-surface"
                    />
                  </li>
                ))}
              </ul>
              <p className="mt-1.5 text-[11px] leading-tight text-ink-muted">
                Only General is required. Readers add their own predictions, and
                the post shows the community median.
              </p>
            </Labelled>
          )}

          {isCutoff && (
            <Labelled
              label="How did you arrive at this?"
              required
              errors={fieldErrors.cutoffBasis}
            >
              <ul className="grid gap-2 sm:grid-cols-2">
                {CUTOFF_BASIS_KEYS.map((key) => {
                  const option = CUTOFF_BASIS[key];
                  const selected = cutoffBasis === key;
                  return (
                    <li key={key}>
                      <button
                        type="button"
                        onClick={() => setCutoffBasis(key)}
                        aria-pressed={selected}
                        className={clsx(
                          "w-full rounded-lg border px-3 py-2.5 text-left transition",
                          selected
                            ? "border-brand-500 bg-brand-50"
                            : "border-hairline hover:bg-canvas"
                        )}
                      >
                        <span className="block text-sm font-semibold text-ink">
                          {option.label}
                        </span>
                        <span className="mt-0.5 block text-[11px] leading-tight text-ink-muted">
                          {option.hint}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </Labelled>
          )}

          {/* How well the author recalls the wording — Memory only. */}
          {isMemory && (
            <Labelled
              label="How well do you recall this question?"
              required
              errors={fieldErrors.recallConfidence}
            >
              <ul className="grid gap-2 sm:grid-cols-2">
                {RECALL_CONFIDENCE_KEYS.map((key) => {
                  const option = RECALL_CONFIDENCE[key];
                  const selected = recallConfidence === key;
                  return (
                    <li key={key}>
                      <button
                        type="button"
                        onClick={() => setRecallConfidence(key)}
                        aria-pressed={selected}
                        className={clsx(
                          "w-full rounded-lg border px-3 py-2.5 text-left transition",
                          selected
                            ? "border-brand-500 bg-brand-50"
                            : "border-hairline hover:bg-canvas"
                        )}
                      >
                        <span className="flex items-baseline justify-between gap-2">
                          <span className="text-sm font-semibold text-ink">
                            {option.label}
                          </span>
                          <span className="text-xs font-bold tabular-nums text-ink-muted">
                            {option.percent}%
                          </span>
                        </span>
                        <span className="mt-0.5 block text-[11px] leading-tight text-ink-muted">
                          {option.hint}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              <p className="mt-1.5 text-[11px] leading-tight text-ink-muted">
                This is about the wording, not the answer. Readers see it as a
                recall meter on your post.
              </p>
            </Labelled>
          )}

          {isObjection && (
            <Labelled
              label="Official answer"
              required
              errors={fieldErrors.officialAnswer}
            >
              <div className="flex gap-2">
                {OPTION_LABELS.map((label) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => setOfficialAnswer(label)}
                    aria-pressed={officialAnswer === label}
                    className={clsx(
                      "flex-1 rounded-lg border px-3 py-2 text-sm font-semibold transition",
                      officialAnswer === label
                        ? "border-settled bg-emerald-50 text-settled"
                        : "border-hairline text-ink hover:bg-canvas"
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <p className="mt-1 text-[11px] leading-tight text-ink-muted">
                The answer the official key gives — not the one you think is
                right. That&apos;s what readers vote on.
              </p>
            </Labelled>
          )}

          <Labelled
            label={
              isObjection
                ? "Why do you think it's wrong?"
                : isMemory
                  ? "Notes (optional)"
                  : isCutoff
                    ? "Reasoning (optional)"
                    : "Description"
            }
            required={!isMemory && !isCutoff}
            errors={fieldErrors.body}
          >
            <textarea
              value={body}
              onChange={(event) => setBody(event.target.value)}
              maxLength={BODY_MAX}
              rows={isChoice || isCutoff ? 4 : 8}
              placeholder={
                isObjection
                  ? "Explain your reasoning so others can judge it."
                  : isMemory
                    ? "Anything else worth noting — the section it came from, a diagram you can't reproduce..."
                    : isCutoff
                      ? "What drove your numbers — shift difficulty, normalisation, last year's cutoff..."
                      : "Write your discussion here..."
              }
              required={!isMemory && !isCutoff}
              className="w-full resize-y rounded-lg border border-hairline bg-canvas px-3 py-2.5 text-sm outline-none transition focus:border-brand-400 focus:bg-surface"
            />
            <p className="mt-1 text-right text-xs text-ink-muted">
              {body.length}/{BODY_MAX}
            </p>
          </Labelled>

          {type === "POLL" && (
            <Labelled label="Poll options" required errors={fieldErrors.pollOptions}>
              <ul className="space-y-2">
                {pollOptions.map((option, index) => (
                  <li key={index} className="flex gap-2">
                    <input
                      value={option}
                      onChange={(event) => {
                        const next = [...pollOptions];
                        next[index] = event.target.value;
                        setPollOptions(next);
                      }}
                      placeholder={`Option ${index + 1}`}
                      className="w-full rounded-lg border border-hairline bg-canvas px-3 py-2 text-sm outline-none focus:border-brand-400 focus:bg-surface"
                    />
                    {pollOptions.length > 2 && (
                      <button
                        type="button"
                        aria-label={`Remove option ${index + 1}`}
                        onClick={() =>
                          setPollOptions(pollOptions.filter((_, i) => i !== index))
                        }
                        className="rounded-lg border border-hairline px-2 text-ink-muted transition hover:bg-canvas"
                      >
                        <X size={16} />
                      </button>
                    )}
                  </li>
                ))}
              </ul>

              {pollOptions.length < 6 && (
                <button
                  type="button"
                  onClick={() => setPollOptions([...pollOptions, ""])}
                  className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-brand-600 hover:underline"
                >
                  <Plus size={14} /> Add option
                </button>
              )}
            </Labelled>
          )}
        </div>

        {/* Metadata sidebar — the "Add Tags" panel from the wireframe. */}
        <aside className="space-y-3 rounded-xl border border-hairline bg-surface p-4">
          <h2 className="text-sm font-bold text-ink">Add Tags</h2>

          <Labelled label="Board" required compact>
            <Select
              value={boardId}
              onChange={(value) => {
                setBoardId(value);
                setExamId("");
                setPhaseId("");
                setSessionId("");
              }}
              placeholder="Select board"
              options={boards.map((b) => ({ value: b.id, label: b.name }))}
            />
          </Labelled>

          <Labelled label="Exam" required compact>
            <Select
              value={examId}
              onChange={(value) => {
                setExamId(value);
                setPhaseId("");
                setSessionId("");
              }}
              placeholder={
                !board
                  ? "Choose a board first"
                  : examOptions.length === 0
                    ? "No open objection window on this board"
                    : "Select exam"
              }
              disabled={!board || examOptions.length === 0}
              options={examOptions.map((e) => ({ value: e.id, label: e.name }))}
            />
            {isObjection && board && examOptions.length === 0 && (
              <p className="mt-1 text-[11px] leading-tight text-object">
                Objections can only be raised while an exam&apos;s objection
                window is open. Try another board.
              </p>
            )}
          </Labelled>

          {/* Which tier: Tier 1 and Tier 2 are separate exams months apart,
              each with its own shifts and its own objection window. */}
          <Labelled label="Phase" required compact>
            <Select
              value={phaseId}
              onChange={(value) => {
                setPhaseId(value);
                setSessionId("");
              }}
              placeholder={
                !exam
                  ? "Choose an exam first"
                  : phaseOptions.length === 0
                    ? "No phase of this exam qualifies"
                    : "Select phase"
              }
              disabled={!exam || phaseOptions.length === 0}
              options={phaseOptions.map((p) => ({ value: p.id, label: p.name }))}
            />
            {exam && phaseOptions.length === 0 && type && (
              <p className="mt-1 text-[11px] leading-tight text-object">
                {requiresConductedPhase(type)
                  ? "None of this exam's phases have started yet. You can post a Discussion or a Poll about it instead."
                  : "No phase of this exam accepts this post type."}
              </p>
            )}
          </Labelled>

          {/* Only shift-scoped types belong to a single sitting. */}
          {shiftScoped && (
            <Labelled label="Date & Shift" required={isObjection} compact>
              <Select
                value={sessionId}
                onChange={setSessionId}
                placeholder={
                  !phase
                    ? "Choose a phase first"
                    : sessionOptions.length === 0
                      ? "No shifts announced yet"
                      : isObjection
                        ? "Select the shift"
                        : "All shifts"
                }
                disabled={!phase || sessionOptions.length === 0}
                options={sessionOptions.map((s) => ({
                  value: s.id,
                  label: s.label,
                }))}
              />
            </Labelled>
          )}

          {isQuestionType && (
            <Labelled label="Question number" required={isObjection} compact>
              <input
                type="number"
                min={1}
                max={500}
                required={isObjection}
                value={questionNumber}
                onChange={(event) => setQuestionNumber(event.target.value)}
                placeholder="e.g. 46"
                className="w-full rounded-lg border border-hairline bg-canvas px-3 py-2 text-sm outline-none focus:border-brand-400 focus:bg-surface"
              />
              <p className="mt-1 text-[11px] leading-tight text-ink-muted">
                {isObjection
                  ? "Required. Readers vote on whether this answer should be challenged."
                  : "Optional. Links this post to the question in the tracker."}
              </p>
            </Labelled>
          )}

          {isObjection && (
            <Labelled label="Subject" compact>
              <input
                value={subject}
                onChange={(event) => setSubject(event.target.value)}
                maxLength={40}
                placeholder="e.g. Reasoning"
                className="w-full rounded-lg border border-hairline bg-canvas px-3 py-2 text-sm outline-none focus:border-brand-400 focus:bg-surface"
              />
            </Labelled>
          )}

          <Labelled label="Optional Tags" compact>
            <div className="flex gap-2">
              <input
                value={tagInput}
                onChange={(event) => setTagInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    addTag();
                  }
                }}
                placeholder="e.g. Maths, Reasoning"
                className="w-full rounded-lg border border-hairline bg-canvas px-3 py-2 text-sm outline-none focus:border-brand-400 focus:bg-surface"
              />
              <button
                type="button"
                onClick={addTag}
                className="rounded-lg border border-hairline px-2.5 text-ink-muted transition hover:bg-canvas"
                aria-label="Add tag"
              >
                <Plus size={16} />
              </button>
            </div>

            {tags.length > 0 && (
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {tags.map((tag) => (
                  <li key={tag}>
                    <button
                      type="button"
                      onClick={() => setTags(tags.filter((t) => t !== tag))}
                      className="inline-flex items-center gap-1 rounded-md bg-brand-50 px-2 py-1 text-xs font-semibold text-brand-700"
                    >
                      #{tag}
                      <X size={12} />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <p className="mt-2 text-[11px] leading-tight text-ink-muted">
              {shiftScoped
                ? "Board, exam, date and shift tags are added automatically."
                : "Board and exam tags are added automatically. Add a shift or date here if this post is about one specific sitting."}
            </p>
          </Labelled>
        </aside>
      </div>

      {error && (
        <p role="alert" className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-object">
          {error}
        </p>
      )}

      <div className="mt-4 flex justify-end gap-2">
        <button
          type="button"
          onClick={() => router.back()}
          className="rounded-lg border border-hairline px-5 py-2.5 text-sm font-semibold text-ink transition hover:bg-canvas"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={
            busy ||
            !boardId ||
            !examId ||
            (isChoice && questionOptions.some((o) => !o.trim())) ||
            (isObjection &&
              (!sessionId || !questionNumber || !officialAnswer)) ||
            !phaseId ||
            (isMemory && (!sessionId || !recallConfidence)) ||
            (isCutoff && (!cutoffBasis || !cutoffMarks.GENERAL?.trim()))
          }
          className="rounded-lg bg-brand-600 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-50"
        >
          {busy ? "Posting..." : "Post"}
        </button>
      </div>
    </form>
  );
}

function Labelled({
  label,
  required,
  compact,
  errors,
  children,
}: {
  label: string;
  required?: boolean;
  compact?: boolean;
  errors?: string[];
  children: React.ReactNode;
}) {
  return (
    <div>
      <label
        className={clsx(
          "mb-1 block font-semibold text-ink",
          compact ? "text-xs" : "text-sm"
        )}
      >
        {label}
        {required && <span className="ml-0.5 text-object">*</span>}
      </label>
      {children}
      {errors?.map((message) => (
        <p key={message} className="mt-1 text-xs text-object">
          {message}
        </p>
      ))}
    </div>
  );
}

function Select({
  value,
  onChange,
  options,
  placeholder,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  placeholder: string;
  disabled?: boolean;
}) {
  return (
    <select
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
      className="w-full rounded-lg border border-hairline bg-canvas px-3 py-2 text-sm outline-none transition focus:border-brand-400 focus:bg-surface disabled:opacity-50"
    >
      <option value="">{placeholder}</option>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
