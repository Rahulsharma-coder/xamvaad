import { handler, ok } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";

/** Returns the session user, or `{ user: null }` for a guest. */
export const GET = handler(async () => {
  return ok({ user: await getCurrentUser() });
});
