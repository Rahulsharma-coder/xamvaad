import Link from "next/link";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getBoards, getFeed, postCardSelect } from "@/lib/queries";
import { TopBar } from "@/components/TopBar";
import { PostCard } from "@/components/PostCard";
import { BoardIcon } from "@/components/BoardIcon";
import { SearchBox } from "@/components/SearchBox";

export const metadata = { title: "Explore" };

type Props = {
  searchParams: Promise<{ q?: string; tag?: string }>;
};

/** Search / Explore (PRD Part 5) — also the target for clickable hashtags. */
export default async function SearchPage({ searchParams }: Props) {
  const { q, tag } = await searchParams;
  const user = await getCurrentUser();

  const query = (q ?? "").trim();
  const hasQuery = query.length >= 2 || Boolean(tag);

  let posts: Awaited<ReturnType<typeof getFeed>>["posts"] = [];
  let boards: Awaited<ReturnType<typeof getBoards>> = [];

  if (tag) {
    const result = await getFeed({ tag, sort: "top" }, { take: 30 });
    posts = result.posts;
  } else if (query.length >= 2) {
    posts = await db.post.findMany({
      where: {
        status: "ACTIVE",
        deletedAt: null,
        OR: [
          { title: { contains: query, mode: "insensitive" } },
          { body: { contains: query, mode: "insensitive" } },
          { exam: { name: { contains: query, mode: "insensitive" } } },
        ],
      },
      select: postCardSelect,
      orderBy: [{ likeCount: "desc" }, { createdAt: "desc" }],
      take: 30,
    });
  } else {
    boards = await getBoards();
  }

  return (
    <div className="page-shell">
      <TopBar user={user} />

      <main className="mx-auto max-w-3xl px-4 py-4">
        <SearchBox initialQuery={query} />

        {tag && (
          <p className="mt-3 text-sm text-ink-muted">
            Posts tagged{" "}
            <span className="font-semibold text-brand-600">#{tag}</span>
          </p>
        )}

        {hasQuery ? (
          <div className="mt-4">
            {posts.length === 0 ? (
              <div className="rounded-xl border border-dashed border-hairline bg-surface p-10 text-center">
                <p className="font-semibold text-ink">No results</p>
                <p className="mt-1 text-sm text-ink-muted">
                  Try an exam name, a question number or a hashtag.
                </p>
              </div>
            ) : (
              <>
                <p className="mb-3 text-xs text-ink-muted">
                  {posts.length} {posts.length === 1 ? "result" : "results"}
                </p>
                <ul className="space-y-3">
                  {posts.map((post) => (
                    <li key={post.id}>
                      <PostCard post={post} />
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        ) : (
          <section className="mt-5">
            <h2 className="mb-3 text-sm font-bold text-ink">Browse by board</h2>
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {boards.map((board) => (
                <li key={board.id}>
                  <Link
                    href={`/boards/${board.slug}`}
                    className="flex h-full flex-col gap-2 rounded-xl border border-hairline bg-surface p-4 transition hover:border-brand-300"
                  >
                    <BoardIcon icon={board.icon} color={board.color} size={36} />
                    <span className="font-bold text-ink">{board.name}</span>
                    <span className="text-xs leading-tight text-ink-muted">
                      {board.fullName}
                    </span>
                    <span className="mt-auto pt-1 text-[11px] text-ink-muted">
                      {board._count.exams} exams · {board._count.posts} posts
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </div>
  );
}
