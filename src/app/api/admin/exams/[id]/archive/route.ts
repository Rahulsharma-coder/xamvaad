import { db } from "@/lib/db";
import { ApiError, handler, ok } from "@/lib/api";
import { requireFullAdminApi } from "@/lib/admin";
import { audit } from "@/lib/audit";

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST /api/admin/exams/:id/archive — toggle archived.
 *
 * Archiving is not deletion. The exam becomes read-only and drops out of
 * active listings, but every discussion stays searchable: "Permanent
 * Knowledge" is one of the product's six principles, and the whole pitch is
 * that this material outlives the exam cycle.
 */
export const POST = handler(async (req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const admin = await requireFullAdminApi();

  const exam = await db.exam.findUnique({
    where: { id },
    select: { id: true, name: true, archivedAt: true },
  });
  if (!exam) throw new ApiError(404, "That exam no longer exists.");

  const archiving = !exam.archivedAt;

  await db.exam.update({
    where: { id },
    data: {
      archivedAt: archiving ? new Date() : null,
      // Archived exams must not appear in "Today's Active Exams".
      isActive: !archiving,
    },
  });

  await audit({
    actor: admin,
    action: archiving ? "exam.archive" : "exam.restore",
    targetType: "Exam",
    targetId: id,
    summary: `${archiving ? "Archived" : "Restored"} ${exam.name}`,
  });

  return ok({ archived: archiving });
});
