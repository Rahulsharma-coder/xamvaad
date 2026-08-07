import { db } from "@/lib/db";
import { ApiError, handler, ok } from "@/lib/api";
import { createSession, hashPassword } from "@/lib/auth";
import { registerSchema } from "@/lib/validation";
import { generateUsername } from "@/lib/username";

export const POST = handler(async (req: Request) => {
  const { name, email, password } = registerSchema.parse(await req.json());

  const existing = await db.user.findUnique({
    where: { email },
    select: { id: true },
  });
  if (existing) {
    throw new ApiError(409, "An account with this email already exists.");
  }

  const user = await db.user.create({
    data: {
      name,
      email,
      username: await generateUsername(name || email),
      passwordHash: await hashPassword(password),
    },
    select: { id: true, name: true, username: true, email: true, image: true },
  });

  await createSession(user.id);
  return ok({ user }, 201);
});
