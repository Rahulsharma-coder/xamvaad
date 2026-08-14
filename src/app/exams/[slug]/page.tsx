import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { FeedSkeleton, TrackerSkeleton } from "@/components/Skeletons";
import { withDerivedStatus } from "@/lib/lifecycle";
import { phaseHasAnswerKey, phaseStatus, pickDefaultPhase } from "@/lib/phases";
import { PhasePicker } from "@/components/PhasePicker";
import { runDueAnnouncements } from "@/lib/announce";
import type { PostType } from "@/prisma/client";
import { getCurrentUser } from "@/lib/auth";
import {
  getExamBySlug,
  getFeed,
  getTrackedQuestions,
  pickDefaultSession,
} from "@/lib/queries";
import { examDate } from "@/lib/format";
import { canPostType, emptyStateFor, isShiftScoped } from "@/lib/rules";
import { isModerator } from "@/lib/admin";
import { EmptyState } from "@/components/EmptyState";
import { LifecycleStepper } from "@/components/LifecycleStepper";
import { PostCard } from "@/components/PostCard";
import { ExamTabs, type TabKey } from "@/components/ExamTabs";
import { ObjectionTrackerSummary } from "@/components/ObjectionTrackerSummary";
import { SessionPicker } from "@/components/SessionPicker";

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ tab?: string; sessionId?: string; phase?: string }>;
};

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  const exam = await getExamBySlug(slug).catch(() => null);
  return { title: exam?.name ?? "Exam" };
}

/** Which post types each tab shows. */
const TAB_TYPES: Record<Exclude<TabKey, "objections">, PostType[]> = {
  discussion: ["DISCUSSION", "EXPECTED_CUTOFF"],
  polls: ["POLL"],
  memory: ["MEMORY_QUESTION"],
  updates: ["OFFICIAL_UPDATE"],
};

/** Exam Hub — wireframe 04. */
export default async function ExamHubPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { tab: rawTab, sessionId, phase: phaseSlug } = await searchParams;

  const exam = await getExamBySlug(slug);
  if (!exam) notFound();

  // Fire any lifecycle transition that has come due. Doing it on read means a
  // window opening at 06:00 announces itself when the first person looks at
  // the exam, with no scheduler to run. Each transition is claimed atomically,
  // so concurrent readers can't double-notify. Never blocks the page.
  runDueAnnouncements(exam.id).catch((err) =>
    console.error("[announce]", err)
  );

  const user = await getCurrentUser();

  // Which tier are we looking at? Everything below is scoped to it.
  const activePhase =
    exam.phases.find((p) => p.slug === phaseSlug) ?? pickDefaultPhase(exam.phases);
  if (!activePhase) notFound();

  // Non-written phases have no answer key, so no questions to remember,
  // challenge or poll about — those tabs would only ever be empty.
  const hasKey = phaseHasAnswerKey(activePhase.kind);
  const rawTabKey: TabKey = isTab(rawTab) ? rawTab : "discussion";
  const tab: TabKey =
    !hasKey && (rawTabKey === "memory" || rawTabKey === "objections" || rawTabKey === "polls")
      ? "discussion"
      : rawTabKey;

  const phaseSessions = activePhase.sessions;
  const activeSession =
    phaseSessions.find((s) => s.id === sessionId) ??
    pickDefaultSession(phaseSessions);

  return (
    <div className="page-shell">
      <header className="sticky top-0 z-30 border-b border-hairline bg-surface/95 backdrop-blur">
        <div className="mx-auto max-w-3xl px-4 py-3">
          <div className="flex items-center gap-2 text-xs text-ink-muted">
            <Link
              href="/"
              aria-label="Back to home"
              className="-ml-1 rounded p-0.5 transition hover:bg-slate-100"
            >
              <ChevronLeft size={16} />
            </Link>
            <Link href={`/boards/${exam.board.slug}`} className="hover:underline">
              {exam.board.name}
            </Link>
            <span aria-hidden="true">›</span>
            <span className="font-semibold text-ink">{exam.shortName}</span>
          </div>

          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h1 className="text-xl font-extrabold text-ink">{exam.name}</h1>
              {activeSession && (
                <p className="mt-0.5 flex items-center gap-2 text-xs text-ink-muted">
                  {examDate(activeSession.date)}
                  <span className="rounded bg-brand-50 px-1.5 py-0.5 font-semibold text-brand-700">
                    {activeSession.shift}
                  </span>
                </p>
              )}
            </div>

            {phaseSessions.length > 1 && (
              <SessionPicker
                sessions={phaseSessions.map((s) => ({
                  id: s.id,
                  label: `${examDate(s.date)} · ${s.shift}`,
                }))}
                activeId={activeSession?.id ?? null}
                tab={tab}
              />
            )}
          </div>

          {exam.phases.length > 1 && (
            <div className="mt-3">
              <PhasePicker
                examSlug={exam.slug}
                activeSlug={activePhase.slug}
                phases={exam.phases.map((p) => ({
                  id: p.id,
                  slug: p.slug,
                  name: p.name,
                  kind: p.kind,
                  status: phaseStatus(p),
                }))}
              />
            </div>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-4">
        {/* The lifecycle belongs to the selected tier: Tier 1's objection
            window closes months before Tier 2's opens. */}
        <LifecycleStepper stages={withDerivedStatus(activePhase.stages)} />

        {phaseSessions.length === 0 && (
          <p className="mt-4 rounded-xl border border-dashed border-hairline bg-surface p-4 text-center text-sm text-ink-muted">
            {activePhase.name} hasn&apos;t been held yet. Shifts appear here once
            the official notification is out.
          </p>
        )}

        <div className="mt-4">
          <ExamTabs
            slug={exam.slug}
            active={tab}
            sessionId={activeSession?.id}
            phaseSlug={activePhase.slug}
            showQuestionTabs={hasKey}
          />
        </div>

        {/* The header and lifecycle above render immediately; only the tab
            body waits on its queries. `key` re-arms the skeleton when you
            switch tab or shift, instead of leaving the old list on screen. */}
        <div className="mt-4">
          {tab === "objections" ? (
            <Suspense
              key={`objections-${activePhase.slug}-${activeSession?.id ?? "all"}`}
              fallback={<TrackerSkeleton />}
            >
              <ObjectionsTab
                examId={exam.id}
                examSlug={exam.slug}
                phaseId={activePhase.id}
                phaseSlug={activePhase.slug}
                sessionId={activeSession?.id}
              />
            </Suspense>
          ) : (
            <Suspense
              key={`${activePhase.slug}-${tab}-${activeSession?.id ?? "all"}`}
              fallback={<FeedSkeleton />}
            >
              <PostsTab
                examSlug={exam.slug}
                phaseId={activePhase.id}
                types={TAB_TYPES[tab]}
                sessionId={activeSession?.id}
                tab={tab}
                isStaff={isModerator(user)}
              />
            </Suspense>
          )}
        </div>
      </main>
    </div>
  );
}

async function PostsTab({
  examSlug,
  phaseId,
  types,
  sessionId,
  tab,
  isStaff,
}: {
  examSlug: string;
  phaseId: string;
  types: PostType[];
  sessionId?: string;
  tab: TabKey;
  isStaff: boolean;
}) {
  // A tab can cover several post types, so query each and merge by recency.
  //
  // Everything is scoped to the selected phase — Tier 2 discussion must not
  // appear under Tier 1. Only shift-scoped types narrow further to the chosen
  // sitting; a Discussion belongs to the whole tier, so filtering it by shift
  // would hide every one of them.
  const results = await Promise.all(
    types.map((type) =>
      getFeed(
        {
          examSlug,
          phaseId,
          type,
          sessionId: isShiftScoped(type) ? sessionId : undefined,
          sort: "top",
        },
        { take: 10 }
      )
    )
  );

  const posts = results
    .flatMap((r) => r.posts)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  if (posts.length === 0) {
    // Official Updates are staff-only, so an ordinary reader on that tab gets
    // the explanation without a button that would only refuse them.
    const canCreate = canPostType(types[0], isStaff);
    return (
      <EmptyState
        {...emptyStateFor(types)}
        action={canCreate ? { href: "/create", label: "Create Post" } : undefined}
      />
    );
  }

  return (
    <section aria-label={`${tab} posts`}>
      <h2 className="mb-3 text-sm font-bold text-ink">
        {tab === "discussion" ? "Trending Posts" : "Posts"}
      </h2>
      <ul className="space-y-3">
        {posts.map((post) => (
          <li key={post.id}>
            <PostCard post={post} />
          </li>
        ))}
      </ul>
    </section>
  );
}

async function ObjectionsTab({
  examId,
  examSlug,
  phaseId,
  phaseSlug,
  sessionId,
}: {
  examId: string;
  examSlug: string;
  phaseId: string;
  phaseSlug: string;
  sessionId?: string;
}) {
  const [questions, raised] = await Promise.all([
    getTrackedQuestions(examId, sessionId, phaseId),
    getFeed(
      { examSlug, phaseId, type: "OBJECTION_QUESTION", sessionId, sort: "top" },
      { take: 10 }
    ),
  ]);

  return (
    <div className="space-y-4">
      <ObjectionTrackerSummary
        questions={questions.slice(0, 4)}
        examSlug={examSlug}
        phaseSlug={phaseSlug}
      />

      <section>
        <h2 className="mb-3 text-sm font-bold text-ink">Objections Raised</h2>
        {raised.posts.length === 0 ? (
          <p className="rounded-xl border border-dashed border-hairline bg-surface p-6 text-center text-sm text-ink-muted">
            No one has raised an objection post for this shift yet.
          </p>
        ) : (
          <ul className="space-y-3">
            {raised.posts.map((post) => (
              <li key={post.id}>
                <PostCard post={post} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function isTab(value: string | undefined): value is TabKey {
  return (
    value === "discussion" ||
    value === "polls" ||
    value === "memory" ||
    value === "updates" ||
    value === "objections"
  );
}
