import { db } from "@/lib/db";
import { ApiError, handler, ok } from "@/lib/api";
import { requireFullAdminApi } from "@/lib/admin";
import { audit } from "@/lib/audit";

type Ctx = { params: Promise<{ id: string }> };

/**
 * PNG is allowed and expected here, unlike avatars: board logos are usually
 * flat marks on transparency, and re-encoding one to JPEG would paint a white
 * box behind it that the tinted tile then shows off.
 */
const ALLOWED = ["image/png", "image/webp", "image/jpeg"];

/** Logos are downscaled to 256px in the browser before upload. */
const MAX_BYTES = 1_000_000;

/** POST /api/admin/boards/:id/image — set the board's logo. */
export const POST = handler(async (req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const admin = await requireFullAdminApi();

  const board = await db.board.findUnique({
    where: { id },
    select: { id: true, name: true },
  });
  if (!board) throw new ApiError(404, "That board no longer exists.");

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");

  if (!(file instanceof File)) throw new ApiError(400, "No image was uploaded.");
  if (!ALLOWED.includes(file.type)) {
    throw new ApiError(415, "Use a PNG, WebP or JPEG image.");
  }
  if (file.size > MAX_BYTES) {
    throw new ApiError(413, "That image is too large. Try a smaller one.");
  }

  const data = Buffer.from(await file.arrayBuffer());
  if (data.length === 0) throw new ApiError(400, "That image is empty.");

  // The token is what makes the new logo appear at once: the <img> src changes,
  // so the browser cannot serve the old bytes from its cache.
  const version = Date.now();
  const url = `/api/boards/${id}/image?v=${version}`;

  await db.$transaction([
    db.boardImage.upsert({
      where: { boardId: id },
      create: { boardId: id, data, mimeType: file.type },
      update: { data, mimeType: file.type },
    }),
    db.board.update({ where: { id }, data: { image: url } }),
  ]);

  await audit({
    actor: admin,
    action: "board.image.update",
    targetType: "Board",
    targetId: id,
    summary: `Set a logo for ${board.name}`,
  });

  return ok({ image: url });
});

/** DELETE /api/admin/boards/:id/image — fall back to the lucide icon. */
export const DELETE = handler(async (_req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const admin = await requireFullAdminApi();

  const board = await db.board.findUnique({
    where: { id },
    select: { id: true, name: true },
  });
  if (!board) throw new ApiError(404, "That board no longer exists.");

  await db.$transaction([
    db.boardImage.deleteMany({ where: { boardId: id } }),
    db.board.update({ where: { id }, data: { image: null } }),
  ]);

  await audit({
    actor: admin,
    action: "board.image.remove",
    targetType: "Board",
    targetId: id,
    summary: `Removed the logo from ${board.name}`,
  });

  return ok({ image: null });
});
