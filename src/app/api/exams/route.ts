import { db } from "@/lib/db";
import { handler, ok } from "@/lib/api";
import { getActiveExams } from "@/lib/queries";

/** GET /api/exams — `?active=1` returns the home-screen list, else all. */
export const GET = handler(async (req: Request) => {
  const url = new URL(req.url);

  if (url.searchParams.get("active") === "1") {
    return ok({ exams: await getActiveExams() });
  }

  const boardSlug = url.searchParams.get("board");
  const exams = await db.exam.findMany({
    where: boardSlug ? { board: { slug: boardSlug } } : {},
    orderBy: [{ year: "desc" }, { name: "asc" }],
    select: {
      id: true,
      slug: true,
      name: true,
      shortName: true,
      year: true,
      isActive: true,
      board: { select: { id: true, slug: true, name: true, color: true } },
      sessions: {
        select: { id: true, date: true, shift: true },
        orderBy: [{ date: "desc" }, { shift: "asc" }],
      },
    },
  });

  return ok({ exams });
});
