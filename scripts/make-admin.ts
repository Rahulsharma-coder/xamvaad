/**
 * Promotes an existing account to a staff role.
 *
 * The only ADMIN in a fresh database comes from the seed, which means a real
 * deployment has no way to make its first administrator without editing rows
 * by hand. This is that way.
 *
 *   npm run make-admin -- you@example.com
 *   npm run make-admin -- you@example.com MODERATOR
 *
 * Sign in with Google or register normally first, then run this.
 */

import { PrismaClient, type Role } from "../src/prisma/client";

const db = new PrismaClient();

const VALID_ROLES: Role[] = ["USER", "MODERATOR", "BOARD_MODERATOR", "ADMIN"];

async function main() {
  const [email, roleArg] = process.argv.slice(2);

  if (!email) {
    console.error("Usage: npm run make-admin -- <email> [role]");
    console.error(`Roles: ${VALID_ROLES.join(", ")} (default ADMIN)`);
    process.exit(1);
  }

  const role = (roleArg ?? "ADMIN").toUpperCase() as Role;
  if (!VALID_ROLES.includes(role)) {
    console.error(`Unknown role "${roleArg}". Use one of: ${VALID_ROLES.join(", ")}`);
    process.exit(1);
  }

  const user = await db.user.findUnique({
    where: { email: email.toLowerCase() },
    select: { id: true, name: true, email: true, role: true },
  });

  if (!user) {
    console.error(`No account found for ${email}.`);
    console.error("Register or sign in with Google first, then run this again.");
    process.exit(1);
  }

  if (user.role === role) {
    console.log(`${user.email} is already ${role}. Nothing to do.`);
    return;
  }

  await db.user.update({ where: { id: user.id }, data: { role } });

  // The promotion itself is an authoritative act and belongs in the log.
  await db.auditLog.create({
    data: {
      actorId: null,
      action: "user.role.change",
      targetType: "User",
      targetId: user.id,
      summary: `${user.email} changed from ${user.role} to ${role} via make-admin script`,
      metadata: { from: user.role, to: role, via: "cli" },
    },
  });

  console.log(`${user.name} <${user.email}>: ${user.role} -> ${role}`);
  console.log("Open /admin to use the dashboard.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
