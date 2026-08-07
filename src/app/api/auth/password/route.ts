import { db } from "@/lib/db";
import { ApiError, handler, ok } from "@/lib/api";
import { hashPassword, requireUser, verifyPassword } from "@/lib/auth";
import { setPasswordSchema } from "@/lib/validation";

/**
 * POST /api/auth/password — set or change the account password.
 *
 * Accounts created through Google have no password, which previously left them
 * unable to sign in any other way. They can now add one; because there is no
 * existing password to prove, the session cookie is the proof of identity.
 * Accounts that already have a password must still supply the current one.
 */
export const POST = handler(async (req: Request) => {
  const user = await requireUser();
  const { currentPassword, newPassword } = setPasswordSchema.parse(
    await req.json()
  );

  const record = await db.user.findUniqueOrThrow({
    where: { id: user.id },
    select: { passwordHash: true },
  });

  const hasPassword = Boolean(record.passwordHash);

  if (hasPassword) {
    if (!currentPassword) {
      throw new ApiError(400, "Enter your current password.");
    }
    if (!(await verifyPassword(currentPassword, record.passwordHash!))) {
      throw new ApiError(401, "That current password is incorrect.");
    }
    if (currentPassword === newPassword) {
      throw new ApiError(
        400,
        "The new password must be different from the current one."
      );
    }
  }

  await db.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(newPassword) },
  });

  return ok({ success: true, hadPassword: hasPassword });
});
