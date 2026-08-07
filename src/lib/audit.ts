import { db } from "./db";
import type { SessionUser } from "./auth";

/**
 * Records an authoritative action.
 *
 * Deliberately best-effort: an audit write must never be the reason a
 * moderator's action fails. A missing log line is recoverable; a report that
 * cannot be actioned during a spam wave is not.
 */
export async function audit(input: {
  actor: SessionUser | null;
  action: string;
  targetType: "Post" | "Comment" | "User" | "Exam" | "Board" | "Question" | "Report";
  targetId: string;
  summary: string;
  reason?: string | null;
  metadata?: Record<string, unknown> | null;
}): Promise<void> {
  try {
    await db.auditLog.create({
      data: {
        actorId: input.actor?.id ?? null,
        action: input.action,
        targetType: input.targetType,
        targetId: input.targetId,
        summary: input.summary,
        reason: input.reason ?? null,
        metadata: (input.metadata ?? undefined) as never,
      },
    });
  } catch (err) {
    console.error("[audit] failed to record", input.action, err);
  }
}
