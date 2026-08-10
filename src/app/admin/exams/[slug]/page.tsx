import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, ExternalLink } from "lucide-react";
import { db } from "@/lib/db";
import { requireAdminPage, scopeAllowsBoard } from "@/lib/admin";
import { deriveStageStatus, STAGE_ORDER } from "@/lib/lifecycle";
import { PHASE_KIND_LABEL, phaseHasAnswerKey, phaseStatus } from "@/lib/phases";
import { toDayInput } from "@/lib/adminValidation";
import { Badge, Card, PageHeader, Stat } from "@/components/admin/ui";
import { LifecycleEditor } from "@/components/admin/LifecycleEditor";
import { AnswerKeyPanel } from "@/components/admin/AnswerKeyPanel";
import { ArchiveButton } from "@/components/admin/ArchiveButton";
import { NewPhaseForm } from "@/components/admin/NewPhaseForm";
import { DeleteButton } from "@/components/admin/DeleteButton";
import { examDate } from "@/lib/format";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  const exam = await db.exam
    .findUnique({ where: { slug }, select: { name: true } })
    .catch(() => null);
  return { title: exam?.name ?? "Exam" };
}

/**
 * One exam, one card per tier.
 *
 * Each phase owns a complete lifecycle and its own answer key, because Tier 1
 * and Tier 2 are separate exams months apart in every respect that matters.
 */
export default async function AdminExamDetail({ params }: Props) {
  const { slug } = await params;
  const scope = await requireAdminPage();

  const exam = await db.exam.findUnique({
    where: { slug },
    select: {
      id: true,
      slug: true,
      name: true,
      year: true,
      boardId: true,
      archivedAt: true,
      board: { select: { name: true } },
      phases: {
        orderBy: { sequence: "asc" },
        select: {
          id: true,
          slug: true,
          name: true,
          shortName: true,
          kind: true,
          sequence: true,
          stages: {
            orderBy: { sortOrder: "asc" },
            select: {
              stage: true,
              statusOverride: true,
              startsAt: true,
              endsAt: true,
              note: true,
            },
          },
          sessions: {
            orderBy: [{ date: "desc" }, { shift: "asc" }],
            select: {
              id: true,
              date: true,
              shift: true,
              _count: { select: { questions: true, posts: true } },
            },
          },
          // Counted the same way the delete guards count, so the number on
          // screen is the number that decides whether a delete is allowed.
          _count: {
            select: {
              posts: { where: { deletedAt: null } },
              questions: true,
            },
          },
        },
      },
      _count: {
        select: { posts: { where: { deletedAt: null } }, questions: true },
      },
    },
  });

  if (!exam) notFound();
  // A board moderator must not reach another board's exam by URL.
  if (!scopeAllowsBoard(scope, exam.boardId)) notFound();

  const unresolved = await db.question.count({
    where: { examId: exam.id, isResolved: false },
  });

  // Soft-deleted posts per phase. Without this a phase whose posts were all
  // deleted reads "0 posts" and deletes cleanly, which is right — but the
  // admin who watched it say "2 posts" a minute ago deserves to see where
  // they went rather than wonder whether the count is lying.
  const removedByPhase = new Map(
    (
      await db.post.groupBy({
        by: ["phaseId"],
        where: { examId: exam.id, deletedAt: { not: null } },
        _count: { _all: true },
      })
    ).map((row) => [row.phaseId, row._count._all])
  );

  const totalShifts = exam.phases.reduce((n, p) => n + p.sessions.length, 0);

  return (
    <>
      <Link
        href="/admin/exams"
        className="mb-3 inline-flex items-center gap-1 text-xs font-semibold text-ink-muted hover:text-ink"
      >
        <ChevronLeft size={14} /> Exam Operations
      </Link>

      <PageHeader
        title={exam.name}
        subtitle={`${exam.board.name} · ${exam.phases.length} phases · ${totalShifts} shifts`}
        action={
          <div className="flex gap-2">
            <Link
              href={`/exams/${exam.slug}`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-hairline bg-surface px-3 py-2 text-xs font-semibold text-ink transition hover:bg-canvas"
            >
              <ExternalLink size={14} />
              View public page
            </Link>
            <ArchiveButton
              examId={exam.id}
              examName={exam.name}
              archived={Boolean(exam.archivedAt)}
            />
            {/* Archive is the answer for an exam people have used; this only
                succeeds on one created by mistake, with nothing filed under it. */}
            <DeleteButton
              endpoint={`/api/admin/exams/${exam.id}`}
              label={exam.name}
              redirectTo="/admin/boards"
            />
          </div>
        }
      />

      {exam.archivedAt && (
        <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
          This exam is archived — read-only for aspirants and hidden from active
          listings. Its discussions remain searchable.
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Posts" value={exam._count.posts} />
        <Stat label="Tracked questions" value={exam._count.questions} />
        <Stat
          label="Unresolved"
          value={unresolved}
          hint="Awaiting final key"
          tone={unresolved > 0 ? "warn" : "good"}
        />
        <Stat label="Phases" value={exam.phases.length} />
      </div>

      <div className="mt-6 mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-bold text-ink">Phases</h2>
        <NewPhaseForm
          examId={exam.id}
          nextSequence={exam.phases.length + 1}
        />
      </div>

      <div className="space-y-4">
        {exam.phases.map((phase) => {
          const rows = STAGE_ORDER.map((stage) => {
            const existing = phase.stages.find((s) => s.stage === stage);
            const shape = existing ?? {
              stage,
              statusOverride: null,
              startsAt: null,
              endsAt: null,
              note: null,
            };
            return {
              stage,
              startsAt: toDayInput(shape.startsAt),
              endsAt: toDayInput(shape.endsAt),
              note: shape.note ?? "",
              statusOverride: (shape.statusOverride ?? "") as
                | ""
                | "DONE"
                | "ACTIVE"
                | "PENDING",
              derived: deriveStageStatus(shape),
            };
          });

          const status = phaseStatus(phase);
          const hasKey = phaseHasAnswerKey(phase.kind);

          // Sittings arrive newest-first, so the last row is the first day.
          const days = phase.sessions.map((s) => toDayInput(s.date));
          const shiftRange = days.length
            ? { start: days[days.length - 1]!, end: days[0]! }
            : null;

          return (
            <Card key={phase.id}>
              <div className="flex flex-wrap items-center gap-2 border-b border-hairline pb-3">
                <h3 className="font-bold text-ink">{phase.name}</h3>
                <Badge
                  tone={
                    status.tone === "live"
                      ? "live"
                      : status.tone === "done"
                        ? "done"
                        : "warn"
                  }
                >
                  {status.label}
                </Badge>
                <Badge>{PHASE_KIND_LABEL[phase.kind]}</Badge>
                <span className="ml-auto flex items-center gap-3">
                  <span className="text-[11px] text-ink-muted">
                    {phase.sessions.length} shifts · {phase._count.posts} posts
                    {(removedByPhase.get(phase.id) ?? 0) > 0 && (
                      <span title="Deleted by their authors or removed by moderation. They no longer block deleting this phase.">
                        {" "}
                        ({removedByPhase.get(phase.id)} removed)
                      </span>
                    )}{" "}
                    · {phase._count.questions} questions
                  </span>
                  {/* Refused if the phase holds anything, or if it is the
                      exam's last one — posts hang off a phase, so an exam
                      without any cannot be posted in. */}
                  <DeleteButton
                    endpoint={`/api/admin/phases/${phase.id}`}
                    label={phase.name}
                  />
                </span>
              </div>

              <div className="mt-4">
                <LifecycleEditor
                  examId={exam.id}
                  phaseId={phase.id}
                  initial={rows}
                  shiftRange={shiftRange}
                />
              </div>

              {hasKey ? (
                <div className="mt-5 border-t border-hairline pt-4">
                  <h4 className="text-sm font-bold text-ink">Answer key</h4>
                  <p className="mb-3 mt-0.5 text-xs text-ink-muted">
                    The provisional key is what the community challenges.
                    Publishing the final key closes voting and reveals which
                    objections were upheld.
                  </p>
                  <AnswerKeyPanel
                    examId={exam.id}
                    sessions={phase.sessions.map((s) => ({
                      id: s.id,
                      label: `${examDate(s.date)} · ${s.shift}`,
                      questionCount: s._count.questions,
                    }))}
                  />
                </div>
              ) : (
                <p className="mt-5 border-t border-hairline pt-4 text-xs text-ink-muted">
                  {PHASE_KIND_LABEL[phase.kind]} — no written paper, so there is
                  no answer key and nothing to object to.
                </p>
              )}
            </Card>
          );
        })}
      </div>
    </>
  );
}
