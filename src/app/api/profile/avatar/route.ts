import { db } from "@/lib/db";
import { ApiError, handler, ok } from "@/lib/api";
import { requireUser } from "@/lib/auth";

/** Formats a browser can decode reliably and that the resizer can produce. */
const ALLOWED = ["image/jpeg", "image/png", "image/webp"];

/**
 * Uploads are resized to 256px in the browser before being sent, so anything
 * arriving above this is either a client that skipped the resize or an abuse
 * attempt. Either way it is rejected rather than stored.
 */
const MAX_BYTES = 1_000_000;

/** POST /api/profile/avatar — replace the signed-in user's picture. */
export const POST = handler(async (req: Request) => {
  const user = await requireUser();

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");

  if (!(file instanceof File)) {
    throw new ApiError(400, "No image was uploaded.");
  }
  if (!ALLOWED.includes(file.type)) {
    throw new ApiError(415, "Use a JPEG, PNG or WebP image.");
  }
  if (file.size > MAX_BYTES) {
    throw new ApiError(413, "That image is too large. Try a smaller one.");
  }

  const data = Buffer.from(await file.arrayBuffer());
  if (data.length === 0) throw new ApiError(400, "That image is empty.");

  // The cache-busting token is what makes the new picture appear immediately:
  // the <img> src changes, so the browser cannot reuse the old cached bytes.
  const version = Date.now();

  await db.$transaction([
    db.profileImage.upsert({
      where: { userId: user.id },
      create: { userId: user.id, data, mimeType: file.type },
      update: { data, mimeType: file.type },
    }),
    db.user.update({
      where: { id: user.id },
      data: { image: `/api/users/${user.id}/avatar?v=${version}` },
    }),
  ]);

  return ok({ image: `/api/users/${user.id}/avatar?v=${version}` });
});

/** DELETE /api/profile/avatar — fall back to generated initials. */
export const DELETE = handler(async () => {
  const user = await requireUser();

  await db.$transaction([
    db.profileImage.deleteMany({ where: { userId: user.id } }),
    db.user.update({ where: { id: user.id }, data: { image: null } }),
  ]);

  return ok({ image: null });
});
