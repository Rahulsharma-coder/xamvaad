import { db } from "@/lib/db";
import { ApiError, handler, ok } from "@/lib/api";
import { createSession, verifyPassword } from "@/lib/auth";
import { loginSchema } from "@/lib/validation";

export const POST = handler(async (req: Request) => {
  const { email, password } = loginSchema.parse(await req.json());

  const user = await db.user.findUnique({
    where: { email },
    select: {
      id: true,
      name: true,
      username: true,
      email: true,
      image: true,
      passwordHash: true,
      isBanned: true,
    },
  });

  // Same message for "no such user" and "wrong password" so the endpoint
  // cannot be used to enumerate registered emails.
  const invalid = new ApiError(401, "Incorrect email or password.");
  if (!user || !user.passwordHash) throw invalid;
  if (!(await verifyPassword(password, user.passwordHash))) throw invalid;
  if (user.isBanned) {
    throw new ApiError(403, "This account has been suspended.");
  }

  await createSession(user.id);
  const { passwordHash: _p, isBanned: _b, ...safe } = user;
  return ok({ user: safe });
});
