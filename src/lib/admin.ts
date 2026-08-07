import { redirect } from "next/navigation";
import { db } from "./db";
import { ApiError } from "./api";
import { getCurrentUser, type SessionUser } from "./auth";

/**
 * Admin access control.
 *
 * Enforced on the server in every admin page and route handler. Hiding the
 * sidebar link is presentation, not security — the guard is what stops a
 * signed-in aspirant from opening /admin/users by typing the URL.
 */

export type AdminScope = {
  user: SessionUser;
  /** Null for full admins; a board id list for board moderators. */
  boardIds: string[] | null;
};

export function isAdmin(user: SessionUser | null): boolean {
  return user?.role === "ADMIN";
}

export function isModerator(user: SessionUser | null): boolean {
  return (
    user?.role === "ADMIN" ||
    user?.role === "MODERATOR" ||
    user?.role === "BOARD_MODERATOR"
  );
}

/**
 * Resolves what this staff member is allowed to see.
 *
 * A BOARD_MODERATOR is scoped to the boards they moderate, so delegating SSC
 * to one person and Banking to another does not hand out the whole platform.
 */
export async function resolveScope(
  user: SessionUser
): Promise<AdminScope> {
  if (user.role === "ADMIN" || user.role === "MODERATOR") {
    return { user, boardIds: null };
  }

  const assignments = await db.boardModerator.findMany({
    where: { userId: user.id },
    select: { boardId: true },
  });

  return { user, boardIds: assignments.map((a) => a.boardId) };
}

/** Page guard — redirects rather than throwing, so the browser lands somewhere. */
export async function requireAdminPage(): Promise<AdminScope> {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/admin");
  if (!isModerator(user)) redirect("/");
  return resolveScope(user);
}

/** Route-handler guard — throws, so `handler()` turns it into JSON. */
export async function requireAdminApi(): Promise<AdminScope> {
  const user = await getCurrentUser();
  if (!user) throw new ApiError(401, "You must be signed in to do that.");
  if (!isModerator(user)) {
    throw new ApiError(403, "This action requires moderator access.");
  }
  return resolveScope(user);
}

/** Full-admin-only actions: creating boards, changing roles, archiving exams. */
export async function requireFullAdminApi(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) throw new ApiError(401, "You must be signed in to do that.");
  if (!isAdmin(user)) {
    throw new ApiError(403, "This action requires administrator access.");
  }
  return user;
}

/** Whether a scope may act on content belonging to a given board. */
export function scopeAllowsBoard(scope: AdminScope, boardId: string): boolean {
  if (scope.boardIds === null) return true;
  return scope.boardIds.includes(boardId);
}

export function assertBoardAllowed(scope: AdminScope, boardId: string): void {
  if (!scopeAllowsBoard(scope, boardId)) {
    throw new ApiError(403, "You don't moderate that board.");
  }
}
