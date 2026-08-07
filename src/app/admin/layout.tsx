import { db } from "@/lib/db";
import { requireAdminPage } from "@/lib/admin";
import { AdminSidebar } from "@/components/admin/AdminSidebar";

export const metadata = {
  title: { default: "Admin", template: "%s · Xamvaad Admin" },
};

const ROLE_LABEL: Record<string, string> = {
  ADMIN: "Administrator",
  MODERATOR: "Moderator",
  BOARD_MODERATOR: "Board Moderator",
};

/**
 * Admin shell.
 *
 * The guard lives here rather than in each page: a layout runs before any
 * child route renders, so every /admin/* path is protected by construction and
 * a new page cannot forget to check. Hiding sidebar links is presentation
 * only — this is the part that actually stops a signed-in aspirant who types
 * the URL.
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const scope = await requireAdminPage();

  // A board moderator's header states exactly what they can touch, so nobody
  // wonders why half the platform is missing.
  let scopeLabel = ROLE_LABEL[scope.user.role] ?? "Staff";
  if (scope.boardIds !== null) {
    const boards = await db.board.findMany({
      where: { id: { in: scope.boardIds } },
      select: { name: true },
      orderBy: { sortOrder: "asc" },
    });
    scopeLabel = boards.length
      ? `Moderator · ${boards.map((b) => b.name).join(", ")}`
      : "Moderator · no boards assigned";
  }

  return (
    <div className="min-h-dvh bg-canvas">
      <div className="mx-auto flex max-w-7xl flex-col gap-5 px-4 py-5 lg:flex-row">
        <aside className="lg:w-60 lg:shrink-0">
          <div className="lg:sticky lg:top-5">
            <AdminSidebar
              name="Xamvaad Admin"
              role={scope.user.role}
              scopeLabel={scopeLabel}
            />
          </div>
        </aside>

        {/* min-w-0 stops wide tables from forcing the whole layout to scroll. */}
        <main className="min-w-0 flex-1 pb-16">{children}</main>
      </div>
    </div>
  );
}
