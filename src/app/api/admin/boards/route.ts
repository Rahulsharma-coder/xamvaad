import { db } from "@/lib/db";
import { ApiError, handler, ok } from "@/lib/api";
import { requireFullAdminApi } from "@/lib/admin";
import { audit } from "@/lib/audit";
import { boardSchema, examSchema } from "@/lib/adminValidation";

/** POST /api/admin/boards — create a board. */
export const POST = handler(async (req: Request) => {
  const admin = await requireFullAdminApi();
  const input = boardSchema.parse(await req.json());

  const clash = await db.board.findUnique({
    where: { slug: input.slug },
    select: { id: true },
  });
  if (clash) throw new ApiError(409, `A board with slug "${input.slug}" exists.`);

  const board = await db.board.create({
    data: {
      slug: input.slug,
      name: input.name,
      fullName: input.fullName,
      description: input.description ?? null,
      icon: input.icon ?? null,
      color: input.color ?? null,
      sortOrder: input.sortOrder ?? 0,
    },
    select: { id: true, slug: true, name: true },
  });

  await audit({
    actor: admin,
    action: "board.create",
    targetType: "Board",
    targetId: board.id,
    summary: `Created board ${board.name}`,
  });

  return ok({ board }, 201);
});

/** PATCH /api/admin/boards — update a board in place. */
export const PATCH = handler(async (req: Request) => {
  const admin = await requireFullAdminApi();
  const body = await req.json();
  const id = typeof body?.id === "string" ? body.id : null;
  if (!id) throw new ApiError(400, "Which board?");

  const input = boardSchema.partial().parse(body);

  const board = await db.board.findUnique({
    where: { id },
    select: { id: true, name: true },
  });
  if (!board) throw new ApiError(404, "That board no longer exists.");

  await db.board.update({
    where: { id },
    data: {
      name: input.name,
      fullName: input.fullName,
      description: input.description,
      icon: input.icon,
      color: input.color,
      sortOrder: input.sortOrder,
      isActive: input.isActive,
    },
  });

  await audit({
    actor: admin,
    action: "board.update",
    targetType: "Board",
    targetId: id,
    summary: `Updated board ${input.name ?? board.name}`,
  });

  return ok({ success: true });
});
