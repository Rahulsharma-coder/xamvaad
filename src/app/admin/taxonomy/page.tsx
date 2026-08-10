import { db } from "@/lib/db";
import { requireAdminPage } from "@/lib/admin";
import { Badge, Card, EmptyRow, PageHeader } from "@/components/admin/ui";
import { ShiftManager } from "@/components/admin/ShiftManager";

export const metadata = { title: "Shifts & Tags" };
export const dynamic = "force-dynamic";

/**
 * Shifts & Tags.
 *
 * Shifts come first because they block posting: until a sitting exists,
 * aspirants cannot file a memory question or an objection against the paper
 * they actually sat.
 */
export default async function AdminTaxonomyPage() {
  const scope = await requireAdminPage();
  const boardFilter =
    scope.boardIds === null ? {} : { boardId: { in: scope.boardIds } };

  const [exams, tags] = await Promise.all([
    db.exam.findMany({
      where: { archivedAt: null, ...boardFilter },
      orderBy: [{ year: "desc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        phases: {
          orderBy: { sequence: "asc" },
          select: {
            id: true,
            name: true,
            sessions: {
              orderBy: [{ date: "desc" }, { shift: "asc" }],
              select: {
                id: true,
                date: true,
                shift: true,
                // Live posts: this drives the padlock on each shift row, and
                // it has to agree with what the DELETE endpoint checks.
                _count: {
                  select: {
                    posts: { where: { deletedAt: null } },
                    questions: true,
                  },
                },
              },
            },
          },
        },
      },
    }),
    db.tag.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        label: true,
        kind: true,
        _count: { select: { posts: true } },
      },
    }),
  ]);

  const manual = tags.filter((t) => t.kind === "MANUAL");
  const auto = tags.filter((t) => t.kind === "AUTO");

  return (
    <>
      <PageHeader
        title="Shifts & Tags"
        subtitle="Define sittings from the official notification. Aspirants can't file a shift-specific post until it exists here."
      />

      <section>
        <h2 className="mb-3 text-base font-bold text-ink">Shifts</h2>
        {exams.length === 0 ? (
          <EmptyRow>No active exams.</EmptyRow>
        ) : (
          <div className="space-y-3">
            {exams.map((exam) => (
              <Card key={exam.id}>
                <ShiftManager
                  examId={exam.id}
                  examName={exam.name}
                  phases={exam.phases.map((phase) => ({
                    id: phase.id,
                    name: phase.name,
                    sessions: phase.sessions.map((s) => ({
                      id: s.id,
                      date: new Date(s.date).toISOString().slice(0, 10),
                      shift: s.shift,
                      posts: s._count.posts,
                      questions: s._count.questions,
                    })),
                  }))}
                />
              </Card>
            ))}
          </div>
        )}
      </section>

      <section className="mt-6">
        <h2 className="mb-1 text-base font-bold text-ink">Tags</h2>
        <p className="mb-3 text-sm text-ink-muted">
          Board, exam, date and shift tags are generated automatically from a
          post&apos;s metadata. Subject tags are added by authors.
        </p>

        <div className="grid gap-3 lg:grid-cols-2">
          <Card>
            <h3 className="text-sm font-bold text-ink">
              Subject tags{" "}
              <span className="font-normal text-ink-muted">
                ({manual.length})
              </span>
            </h3>
            {manual.length === 0 ? (
              <p className="mt-3 text-sm text-ink-muted">None yet.</p>
            ) : (
              <ul className="mt-3 flex flex-wrap gap-1.5">
                {manual.map((tag) => (
                  <li key={tag.id}>
                    <span className="inline-flex items-center gap-1 rounded-full bg-canvas px-2.5 py-1 text-xs font-medium text-ink">
                      #{tag.label}
                      <span className="text-ink-muted">{tag._count.posts}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <h3 className="text-sm font-bold text-ink">
              Generated tags{" "}
              <span className="font-normal text-ink-muted">({auto.length})</span>
            </h3>
            <p className="mt-1 text-xs text-ink-muted">
              Created from post metadata — not editable by hand.
            </p>
            {auto.length > 0 && (
              <ul className="mt-3 flex flex-wrap gap-1.5">
                {auto.slice(0, 40).map((tag) => (
                  <li key={tag.id}>
                    <Badge>#{tag.label}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </section>
    </>
  );
}
