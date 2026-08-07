import Link from "next/link";
import { notFound } from "next/navigation";
import clsx from "clsx";
import { db } from "@/lib/db";
import { getTrackedQuestions } from "@/lib/queries";
import { compactCount } from "@/lib/format";
import { DetailBar } from "@/components/TopBar";
import { ObjectionPill } from "@/components/ObjectionMeter";
import { OBJECTION_LABEL, objectionLevel } from "@/lib/rules";

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ sessionId?: string }>;
};

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  return { title: `Objection Tracker · ${slug}` };
}

/** Objection Tracker list — wireframe 08. */
export default async function ObjectionListPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { sessionId } = await searchParams;

  const exam = await db.exam.findUnique({
    where: { slug },
    select: { id: true, slug: true, name: true },
  });
  if (!exam) notFound();

  const questions = await getTrackedQuestions(exam.id, sessionId);

  return (
    <div className="page-shell">
      <DetailBar title="Objection Tracker" backHref={`/exams/${slug}?tab=objections`} />

      <main className="mx-auto max-w-3xl px-4 py-4">
        <p className="mb-3 text-xs text-ink-muted">
          {exam.name} · sorted by most challenged
        </p>

        {questions.length === 0 ? (
          <div className="rounded-xl border border-dashed border-hairline bg-surface p-8 text-center">
            <p className="font-semibold text-ink">Nothing tracked yet</p>
            <p className="mt-1 text-sm text-ink-muted">
              Questions appear here once the answer key is out and aspirants
              start flagging answers.
            </p>
          </div>
        ) : (
          <ul className="space-y-2.5">
            {questions.map((question) => {
              const level = objectionLevel(
                question.objectVotes,
                question.correctVotes
              );
              const total = question.objectVotes + question.correctVotes;

              return (
                <li key={question.id}>
                  <Link
                    href={`/exams/${slug}/questions/${question.number}`}
                    className="flex items-center gap-3 rounded-xl border border-hairline bg-surface p-3.5 transition hover:border-brand-300"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-ink">Q.{question.number}</p>
                      <p className="mt-0.5 text-xs text-ink-muted">
                        Official Answer: {question.officialAnswer ?? "—"}
                        {question.subject && ` · ${question.subject}`}
                      </p>
                      <p className="mt-0.5 text-xs text-ink-muted">
                        {compactCount(total)} votes · {question._count.posts}{" "}
                        {question._count.posts === 1 ? "discussion" : "discussions"}
                      </p>
                    </div>

                    <div className="shrink-0 text-right">
                      <ObjectionPill
                        objectVotes={question.objectVotes}
                        correctVotes={question.correctVotes}
                      />
                      <p
                        className={clsx(
                          "mt-1 text-[10px] font-semibold",
                          level === "STRONG" && "text-object",
                          level === "REVIEW" && "text-review",
                          level === "LOW" && "text-settled",
                          level === "INSUFFICIENT" && "text-ink-muted"
                        )}
                      >
                        {OBJECTION_LABEL[level]}
                      </p>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}

        <p className="mt-5 rounded-lg bg-canvas px-3 py-3 text-xs leading-relaxed text-ink-muted">
          Xamvaad does not file objections on your behalf. Objections must be
          submitted on the official exam portal within the objection window.
        </p>
      </main>
    </div>
  );
}
