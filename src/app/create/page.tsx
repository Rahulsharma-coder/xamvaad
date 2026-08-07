import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser, isStaff } from "@/lib/auth";
import { deriveStageStatus } from "@/lib/lifecycle";
import { DetailBar } from "@/components/TopBar";
import { CreatePostFlow } from "@/components/CreatePostFlow";

export const metadata = { title: "Create Post" };

/** Create Post — wireframes 12 (type picker) and 13 (form). */
export default async function CreatePostPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/create");

  const boards = await db.board.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: "asc" },
    select: {
      id: true,
      slug: true,
      name: true,
      exams: {
        where: { isActive: true },
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          // Shifts and the objection window both belong to a tier, so the
          // picker is phase-first: Tier 1 may be open for objections while
          // Tier 2 has not been held at all.
          phases: {
            orderBy: { sequence: "asc" },
            select: {
              id: true,
              name: true,
              kind: true,
              sessions: {
                orderBy: [{ date: "desc" }, { shift: "asc" }],
                select: { id: true, date: true, shift: true },
              },
              stages: {
                where: { stage: { in: ["OBJECTION_WINDOW", "CONDUCTED"] } },
                select: {
                  stage: true,
                  statusOverride: true,
                  startsAt: true,
                  endsAt: true,
                },
              },
            },
          },
        },
      },
    },
  });

  return (
    <div className="page-shell">
      <DetailBar title="Create Post" backHref="/" />
      <main className="mx-auto max-w-3xl px-4 py-4">
        <CreatePostFlow
          boards={boards.map((board) => ({
            id: board.id,
            name: board.name,
            exams: board.exams.map((exam) => ({
              id: exam.id,
              name: exam.name,
              phases: exam.phases.map((phase) => {
                const window = phase.stages.find(
                  (s) => s.stage === "OBJECTION_WINDOW"
                );
                const conducted = phase.stages.find(
                  (s) => s.stage === "CONDUCTED"
                );
                return {
                  id: phase.id,
                  name: phase.name,
                  // Same derivation the API enforces, so the picker never
                  // offers a type the server will reject.
                  objectionOpen:
                    phase.kind === "WRITTEN" && window
                      ? deriveStageStatus(window) === "ACTIVE"
                      : false,
                  hasAnswerKey: phase.kind === "WRITTEN",
                  // Memory questions, objections and cutoffs open the moment
                  // the exam window does — the first shift is enough.
                  conducted: conducted
                    ? deriveStageStatus(conducted) !== "PENDING"
                    : false,
                  sessions: phase.sessions.map((session) => ({
                    id: session.id,
                    // Serialise dates for the client component boundary.
                    label: `${new Date(session.date).toLocaleDateString("en-IN", {
                      day: "numeric",
                      month: "long",
                      timeZone: "UTC",
                    })} · ${session.shift}`,
                  })),
                };
              }),
            })),
          }))}
          canPostOfficial={isStaff(user)}
        />
      </main>
    </div>
  );
}
