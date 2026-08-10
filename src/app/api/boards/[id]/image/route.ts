import { db } from "@/lib/db";
import { handler } from "@/lib/api";

type Ctx = { params: Promise<{ id: string }> };

/**
 * GET /api/boards/:id/image — serves an uploaded board logo.
 *
 * Public: board logos appear on the home rail before anyone signs in. Callers
 * arrive with the `?v=` token minted at upload, so this can be cached hard —
 * replacing a logo produces a new URL rather than needing the old one
 * revalidated.
 */
export const GET = handler(async (_req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;

  const logo = await db.boardImage.findUnique({
    where: { boardId: id },
    select: { data: true, mimeType: true, updatedAt: true },
  });

  if (!logo) return new Response("Not found", { status: 404 });

  return new Response(new Uint8Array(logo.data), {
    headers: {
      "Content-Type": logo.mimeType,
      "Content-Length": String(logo.data.length),
      "Cache-Control": "public, max-age=31536000, immutable",
      ETag: `"${id}-${logo.updatedAt.getTime()}"`,
    },
  });
});
