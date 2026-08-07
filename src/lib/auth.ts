import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import type { Role } from "@/prisma/client";
import { db } from "./db";

const COOKIE_NAME = "xamvaad_session";
const SESSION_DAYS = 30;

function secret() {
  const value = process.env.AUTH_SECRET;
  if (!value || value.length < 16) {
    throw new Error(
      "AUTH_SECRET is missing or too short. Copy .env.example to .env and set it."
    );
  }
  return new TextEncoder().encode(value);
}

export type SessionUser = {
  id: string;
  name: string;
  username: string;
  email: string;
  image: string | null;
  role: Role;
};

export async function hashPassword(plain: string) {
  return bcrypt.hash(plain, 12);
}

export async function verifyPassword(plain: string, hash: string) {
  return bcrypt.compare(plain, hash);
}

/** Issues the session cookie. Called after login, register and OAuth callback. */
export async function createSession(userId: string) {
  const token = await new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(secret());

  const jar = await cookies();
  jar.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
}

export async function destroySession() {
  const jar = await cookies();
  jar.delete(COOKIE_NAME);
}

/**
 * Resolves the signed-in user, or null for a guest.
 *
 * Guest mode (wireframe 02, "Explore as Guest") is simply the null case —
 * there is no guest User row. Read paths tolerate null; write paths call
 * `requireUser` instead.
 */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE_NAME)?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, secret());
    const userId = payload.sub;
    if (typeof userId !== "string") return null;

    const user = await db.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        username: true,
        email: true,
        image: true,
        role: true,
        isBanned: true,
        bannedUntil: true,
      },
    });

    if (!user) return null;

    // A temporary ban lapses on its own — `bannedUntil` in the past means the
    // suspension is served, and nobody has to remember to lift it. The flag is
    // cleared lazily so the account stops showing as blocked in the admin list.
    if (user.isBanned) {
      const expired = user.bannedUntil !== null && user.bannedUntil <= new Date();
      if (!expired) return null;

      await db.user.update({
        where: { id: user.id },
        data: { isBanned: false, bannedUntil: null, banReason: null },
      });
    }

    const { isBanned: _ignored, bannedUntil: _until, ...session } = user;
    return session;
  } catch {
    // Expired or tampered token — treat as a guest rather than throwing.
    return null;
  }
}

export class UnauthorizedError extends Error {
  constructor() {
    super("You must be signed in to do that.");
    this.name = "UnauthorizedError";
  }
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) throw new UnauthorizedError();
  return user;
}

const STAFF: Role[] = ["MODERATOR", "BOARD_MODERATOR", "ADMIN"];

export function isStaff(user: SessionUser | null): boolean {
  return !!user && STAFF.includes(user.role);
}

/** Post edit/delete: the author, or any staff member (PRD Part 7). */
export function canModifyPost(
  user: SessionUser | null,
  authorId: string
): boolean {
  if (!user) return false;
  return user.id === authorId || isStaff(user);
}
