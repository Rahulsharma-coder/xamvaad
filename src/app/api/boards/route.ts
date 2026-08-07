import { handler, ok } from "@/lib/api";
import { getBoards } from "@/lib/queries";

export const GET = handler(async () => {
  return ok({ boards: await getBoards() });
});
