import { db } from "@/lib/db";
import { handler } from "@/lib/api";

type Ctx = { params: Promise<{ id: string }> };

/**
 * GET /api/users/:id/avatar — serves an uploaded profile picture.
 *
 * Public, like any avatar on a social platform. Callers always arrive with a
 * `?v=` token minted at upload time, so the response can be cached hard: a new
 * upload produces a new URL rather than needing the old one revalidated.
 */
export const GET = handler(async (_req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;

  const image = await db.profileImage.findUnique({
    where: { userId: id },
    select: { data: true, mimeType: true, updatedAt: true },
  });

  if (!image) {
    return new Response("Not found", { status: 404 });
  }

  return new Response(new Uint8Array(image.data), {
    headers: {
      "Content-Type": image.mimeType,
      "Content-Length": String(image.data.length),
      "Cache-Control": "public, max-age=31536000, immutable",
      ETag: `"${id}-${image.updatedAt.getTime()}"`,
    },
  });
});
