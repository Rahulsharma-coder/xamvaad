import { db } from "./db";

/**
 * Derives a unique @handle from a display name or email, appending a numeric
 * suffix on collision. Runs at signup only, so the extra queries are fine.
 */
export async function generateUsername(seed: string): Promise<string> {
  const base =
    seed
      .split("@")[0]!
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "")
      .slice(0, 20) || "aspirant";

  for (let attempt = 0; attempt < 50; attempt++) {
    const candidate = attempt === 0 ? base : `${base}${attempt + 1}`;
    const taken = await db.user.findUnique({
      where: { username: candidate },
      select: { id: true },
    });
    if (!taken) return candidate;
  }

  // Astronomically unlikely; fall back to a random suffix.
  return `${base}${Math.floor(Math.random() * 1_000_000)}`;
}
