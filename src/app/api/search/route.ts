import { db } from "@/lib/db";
import { handler, ok, pagination } from "@/lib/api";
import { postCardSelect } from "@/lib/queries";

/**
 * GET /api/search?q=
 *
 * Postgres `ILIKE` across titles and bodies, plus exam and board name matches.
 * Good enough for the MVP; a `tsvector` index is the obvious upgrade once the
 * corpus is large enough to need ranking.
 */
export const GET = handler(async (req: Request) => {
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  const { skip, limit, page } = pagination(url);

  if (q.length < 2) {
    return ok({ query: q, posts: [], exams: [], boards: [], total: 0, page, limit });
  }

  const where = {
    status: "ACTIVE" as const,
    deletedAt: null,
    OR: [
      { title: { contains: q, mode: "insensitive" as const } },
      { body: { contains: q, mode: "insensitive" as const } },
      { exam: { name: { contains: q, mode: "insensitive" as const } } },
      { tags: { some: { tag: { name: { contains: q.toLowerCase().replace(/^#/, "") } } } } },
    ],
  };

  const [posts, total, exams, boards] = await Promise.all([
    db.post.findMany({
      where,
      select: postCardSelect,
      orderBy: [{ likeCount: "desc" }, { createdAt: "desc" }],
      skip,
      take: limit,
    }),
    db.post.count({ where }),
    db.exam.findMany({
      where: { name: { contains: q, mode: "insensitive" } },
      select: {
        id: true,
        slug: true,
        name: true,
        board: { select: { slug: true, name: true, color: true } },
      },
      take: 5,
    }),
    db.board.findMany({
      where: {
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          { fullName: { contains: q, mode: "insensitive" } },
        ],
      },
      select: { id: true, slug: true, name: true, fullName: true, color: true },
      take: 5,
    }),
  ]);

  return ok({
    query: q,
    posts,
    exams,
    boards,
    total,
    page,
    limit,
    hasMore: skip + posts.length < total,
  });
});
