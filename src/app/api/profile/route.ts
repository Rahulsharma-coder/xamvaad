import { db } from "@/lib/db";
import { handler, ok } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { updateProfileSchema } from "@/lib/validation";

/** PATCH /api/profile — update the signed-in user's display name and bio. */
export const PATCH = handler(async (req: Request) => {
  const user = await requireUser();
  const input = updateProfileSchema.parse(await req.json());

  const data: { name?: string; bio?: string | null } = {};
  if (input.name !== undefined) data.name = input.name;
  // An empty string means "clear it", which is stored as null.
  if (input.bio !== undefined) data.bio = input.bio === "" ? null : input.bio;

  const updated = await db.user.update({
    where: { id: user.id },
    data,
    select: { id: true, name: true, username: true, bio: true, image: true },
  });

  return ok({ user: updated });
});
