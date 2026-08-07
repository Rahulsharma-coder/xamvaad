import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { examDate } from "@/lib/format";
import { DetailBar } from "@/components/TopBar";
import { ObjectionVote } from "@/components/ObjectionVote";
import { PostCard } from "@/components/PostCard";
import { postCardSelect } from "@/lib/queries";
import { TagChip } from "@/components/Tags";
import { dateTagLabel } from "@/lib/rules";

type Props = {
  params: Promise<{ slug: string; number: string }>;
  searchParams: Promise<{ sessionId?: string }>;
};

export async function generateMetadata({ params }: Props) {
  const { number } = await params;
  return { title: `Question ${number}` };
}

/** Question objection detail — wireframes 09, 10 and 11. */
export default async function QuestionDetailPage({ params, searchParams }: Props) {
  const { slug, number } = await params;
  const { sessionId } = await searchParams;

  const parsedNumber = Number(number);
  if (!Number.isInteger(parsedNumber) || parsedNumber < 1) notFound();

  const exam = await db.exam.findUnique({
    where: { slug },
    select: {
      id: true,
      slug: true,
      name: true,
      shortName: true,
      board: { select: { name: true } },
    },
  });
  if (!exam) notFound();

  const question = await db.question.findFirst({
    where: {
      examId: exam.id,
      number: parsedNumber,
      ...(sessionId ? { sessionId } : {}),
    },
    select: {
      id: true,
      number: true,
      text: true,
      subject: true,
      officialAnswer: true,
      finalAnswer: true,
      isResolved: true,
      objectVotes: true,
      correctVotes: true,
      session: { select: { id: true, date: true, shift: true } },
    },
  });
  if (!question) notFound();

  const user = await getCurrentUser();

  const [myVote, discussions] = await Promise.all([
    user
      ? db.objectionVote.findUnique({
          where: {
            questionId_userId: { questionId: question.id, userId: user.id },
          },
          select: { stance: true },
        })
      : null,
    db.post.findMany({
      where: { questionId: question.id, status: "ACTIVE", deletedAt: null },
      select: postCardSelect,
      orderBy: { likeCount: "desc" },
      take: 10,
    }),
  ]);

  const tags = [
    { name: exam.board.name.toLowerCase(), label: exam.board.name },
    { name: exam.shortName.toLowerCase(), label: exam.shortName },
    {
      name: dateTagLabel(question.session.date).toLowerCase(),
      label: dateTagLabel(question.session.date),
    },
    {
      name: question.session.shift.replace(/\s+/g, "").toLowerCase(),
      label: question.session.shift.replace(/\s+/g, ""),
    },
  ];

  return (
    <div className="page-shell">
      <DetailBar
        title={`Question ${question.number}`}
        backHref={`/exams/${slug}/objections`}
      />

      <main className="mx-auto max-w-3xl space-y-4 px-4 py-4">
        <div>
          <div className="flex flex-wrap gap-x-2.5 gap-y-1">
            {tags.map((tag) => (
              <TagChip key={tag.name} name={tag.name} label={tag.label} />
            ))}
          </div>

          <h1 className="mt-2 text-xl font-extrabold text-ink">
            Question {question.number}
          </h1>

          <p className="mt-1 text-sm text-ink-muted">
            Official Answer:{" "}
            <span className="font-semibold text-ink">
              {question.officialAnswer ?? "Not published"}
            </span>
            {question.finalAnswer &&
              question.finalAnswer !== question.officialAnswer && (
                <>
                  {" · "}Final Key:{" "}
                  <span className="font-semibold text-settled">
                    {question.finalAnswer}
                  </span>
                </>
              )}
          </p>

          <p className="mt-0.5 text-xs text-ink-muted">
            {examDate(question.session.date)} · {question.session.shift}
            {question.subject && ` · ${question.subject}`}
          </p>

          {question.text && (
            <p className="mt-3 rounded-xl border border-hairline bg-surface p-4 text-sm leading-relaxed text-ink">
              {question.text}
            </p>
          )}
        </div>

        <ObjectionVote
          questionId={question.id}
          questionNumber={question.number}
          officialAnswer={question.officialAnswer}
          objectVotes={question.objectVotes}
          correctVotes={question.correctVotes}
          myStance={myVote?.stance ?? null}
          signedIn={Boolean(user)}
          isResolved={question.isResolved}
        />

        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-bold text-ink">
              Discussion ({discussions.length})
            </h2>
            <Link
              href="/create"
              className="text-xs font-semibold text-brand-600 hover:underline"
            >
              Start one
            </Link>
          </div>

          {discussions.length === 0 ? (
            <p className="rounded-xl border border-dashed border-hairline bg-surface p-6 text-center text-sm text-ink-muted">
              No discussion linked to this question yet.
            </p>
          ) : (
            <ul className="space-y-3">
              {discussions.map((post) => (
                <li key={post.id}>
                  <PostCard post={post} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
