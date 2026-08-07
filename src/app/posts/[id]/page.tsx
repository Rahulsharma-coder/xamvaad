import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { canModifyPost, getCurrentUser, isStaff } from "@/lib/auth";
import { getPost, getViewerState } from "@/lib/queries";
import { examDate, timeAgo } from "@/lib/format";
import { DetailBar } from "@/components/TopBar";
import { Avatar } from "@/components/Avatar";
import { PostActions } from "@/components/PostActions";
import { PollBlock } from "@/components/PollBlock";
import { CommentsSection } from "./CommentsSection";
import { CommentsSkeleton } from "@/components/Skeletons";
import { PostTypeBadge, TagRow } from "@/components/Tags";
import { ObjectionVote } from "@/components/ObjectionVote";
import { QuestionAnswerBlock } from "@/components/QuestionAnswerBlock";
import { MemoryQuestionBlock } from "@/components/MemoryQuestionBlock";
import { CutoffBlock } from "@/components/CutoffBlock";
import { summariseCutoffPost } from "@/lib/cutoff";
import { PostMenu } from "@/components/PostMenu";
import { showsObjectionMeter } from "@/lib/rules";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props) {
  const { id } = await params;
  const post = await getPost(id).catch(() => null);
  return { title: post?.title ?? "Post" };
}

/** Post detail — wireframe 05, with the poll block from 06/11 inline. */
export default async function PostDetailPage({ params }: Props) {
  const { id } = await params;

  const post = await getPost(id);
  if (!post || post.status === "REMOVED") notFound();

  const user = await getCurrentUser();
  if (post.status === "HIDDEN" && post.author.id !== user?.id && !isStaff(user)) {
    notFound();
  }

  // Small and needed for the like/save buttons, so it stays inline; the
  // comments are the slow query and stream separately below.
  const viewer = await getViewerState(user?.id ?? null, [post.id]);

  // How the viewer already voted, so the objection buttons show their state.
  const myObjectionStance =
    user && post.question
      ? (
          await db.objectionVote.findUnique({
            where: {
              questionId_userId: { questionId: post.question.id, userId: user.id },
            },
            select: { stance: true },
          })
        )?.stance ?? null
      : null;

  // ...and which option they said they marked in the exam.
  const myMarkOptionId =
    user && post.question
      ? (
          await db.questionMark.findUnique({
            where: {
              questionId_userId: { questionId: post.question.id, userId: user.id },
            },
            select: { optionId: true },
          })
        )?.optionId ?? null
      : null;

  // Community medians for an Expected Cutoff, computed server-side so the
  // table is populated on first paint.
  const cutoffState =
    post.type === "EXPECTED_CUTOFF"
      ? await summariseCutoffPost(post.id, user?.id ?? null)
      : { community: {}, totalEstimates: 0, myEstimate: null };

  const backHref = `/exams/${post.exam.slug}`;

  return (
    <div className="page-shell">
      <DetailBar
        title={post.exam.name}
        backHref={backHref}
        action={
          <PostMenu
            postId={post.id}
            signedIn={Boolean(user)}
            canDelete={canModifyPost(user, post.author.id)}
            backHref={backHref}
          />
        }
      />

      <main className="mx-auto max-w-3xl space-y-4 px-4 py-4">
        <article className="rounded-xl border border-hairline bg-surface p-4">
          <TagRow tags={post.tags} max={8} />

          <div className="mt-2 flex items-start justify-between gap-3">
            <h1 className="text-xl font-extrabold leading-snug text-ink">
              {post.title}
            </h1>
            <PostTypeBadge type={post.type} />
          </div>

          <div className="mt-3 flex items-center gap-2">
            <Avatar name={post.author.name} image={post.author.image} size={32} />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-ink">
                {post.author.name}
                {post.author.role !== "USER" && (
                  <span className="ml-1.5 rounded bg-brand-50 px-1.5 py-0.5 text-[10px] font-bold uppercase text-brand-700">
                    {post.author.role === "ADMIN" ? "Official" : "Mod"}
                  </span>
                )}
              </p>
              <p className="text-xs text-ink-muted">
                {timeAgo(post.createdAt)}
                {post.editedAt && " · edited"}
                {post.session &&
                  ` · ${examDate(post.session.date)} · ${post.session.shift}`}
              </p>
            </div>
          </div>

          {/* The question itself is the headline for choice-question types,
              so the body is only shown when the author added a note. */}
          {post.body && (
            <div className="mt-4 whitespace-pre-line text-[15px] leading-relaxed text-ink">
              {post.body}
            </div>
          )}

          <div className="mt-4 border-t border-hairline pt-3">
            <PostActions
              postId={post.id}
              initialLikeCount={post.likeCount}
              initialLiked={viewer.liked.has(post.id)}
              commentCount={post.commentCount}
              initialSaved={viewer.saved.has(post.id)}
              signedIn={Boolean(user)}
            />
          </div>
        </article>

        {post.type === "EXPECTED_CUTOFF" && (
          <CutoffBlock
            postId={post.id}
            predictions={post.cutoffPredictions}
            basis={post.cutoffBasis}
            initial={cutoffState}
            signedIn={Boolean(user)}
          />
        )}

        {post.poll && post.type === "MEMORY_QUESTION" && (
          <MemoryQuestionBlock
            pollId={post.poll.id}
            questionNumber={post.question?.number ?? null}
            subject={post.question?.subject ?? null}
            questionText={post.title}
            options={post.poll.options}
            votedOptionId={viewer.pollVotes.get(post.id) ?? null}
            confidence={post.recallConfidence}
            signedIn={Boolean(user)}
          />
        )}

        {post.poll && post.type !== "MEMORY_QUESTION" && (
          <PollBlock
            pollId={post.poll.id}
            question={post.poll.question}
            options={post.poll.options}
            votedOptionId={viewer.pollVotes.get(post.id) ?? null}
            signedIn={Boolean(user)}
            closesAt={post.poll.closesAt}
          />
        )}

        {/* The objection meter belongs to Objection Questions only. A Memory
            Question may reference the same numbered question, but it isn't
            disputing the answer, so it gets a plain link instead. */}
        {post.question && showsObjectionMeter(post.type) && (
          <>
            {post.question.options.length > 0 && (
              <QuestionAnswerBlock
                questionId={post.question.id}
                questionNumber={post.question.number}
                subject={post.question.subject}
                questionText={post.question.text ?? post.title}
                options={post.question.options}
                officialAnswer={post.question.officialAnswer}
                myOptionId={myMarkOptionId}
                signedIn={Boolean(user)}
              />
            )}

            <ObjectionVote
              questionId={post.question.id}
              questionNumber={post.question.number}
              officialAnswer={post.question.officialAnswer}
              objectVotes={post.question.objectVotes}
              correctVotes={post.question.correctVotes}
              myStance={myObjectionStance}
              signedIn={Boolean(user)}
              isResolved={post.question.isResolved}
              heading="Should this be challenged?"
            />
          </>
        )}

        {post.question && !showsObjectionMeter(post.type) && (
          <Link
            href={`/exams/${post.exam.slug}/questions/${post.question.number}`}
            className="flex items-center justify-between gap-3 rounded-xl border border-hairline bg-surface p-4 transition hover:border-brand-300"
          >
            <div>
              <p className="text-sm font-semibold text-ink">
                Question {post.question.number}
              </p>
              <p className="mt-0.5 text-xs text-ink-muted">
                Official Answer: {post.question.officialAnswer ?? "Not published"}
              </p>
            </div>
            <span className="shrink-0 text-xs font-semibold text-brand-600">
              Open in tracker
            </span>
          </Link>
        )}

        {/* Streams in behind a skeleton — the post above is already readable
            by the time these arrive. */}
        <Suspense fallback={<CommentsSkeleton />}>
          <CommentsSection
            postId={post.id}
            commentCount={post.commentCount}
            signedIn={Boolean(user)}
            currentUserId={user?.id ?? null}
          />
        </Suspense>
      </main>
    </div>
  );
}
