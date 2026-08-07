-- Admin dashboard support.
--
-- Four themes:
--   * lifecycle status becomes derived, so `status` turns into an override
--   * stage transitions record when they were announced (announce once)
--   * moderation gains reasons and temporary bans
--   * every authoritative action is written to an audit log

-- --------------------------------------------------------------------------
-- Exam lifecycle
-- --------------------------------------------------------------------------

-- The old NOT NULL `status` becomes a nullable override. Existing rows keep
-- their value, so nothing changes visually until an admin edits the dates.
ALTER TABLE "ExamStageEntry" RENAME COLUMN "status" TO "statusOverride";
ALTER TABLE "ExamStageEntry" ALTER COLUMN "statusOverride" DROP NOT NULL;
ALTER TABLE "ExamStageEntry" ALTER COLUMN "statusOverride" DROP DEFAULT;

ALTER TABLE "ExamStageEntry" ADD COLUMN "startAnnouncedAt" TIMESTAMP(3);
ALTER TABLE "ExamStageEntry" ADD COLUMN "endAnnouncedAt" TIMESTAMP(3);

-- Stages already in the past were never announced through the new pipeline;
-- backfill so seeded exams don't fire a burst of historical notifications.
UPDATE "ExamStageEntry"
   SET "startAnnouncedAt" = "startsAt"
 WHERE "startsAt" IS NOT NULL AND "startsAt" <= NOW();

UPDATE "ExamStageEntry"
   SET "endAnnouncedAt" = "endsAt"
 WHERE "endsAt" IS NOT NULL AND "endsAt" <= NOW();

-- --------------------------------------------------------------------------
-- Archiving
-- --------------------------------------------------------------------------

ALTER TABLE "Exam" ADD COLUMN "archivedAt" TIMESTAMP(3);

-- --------------------------------------------------------------------------
-- Moderation
-- --------------------------------------------------------------------------

ALTER TABLE "User" ADD COLUMN "bannedUntil" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "banReason" TEXT;
ALTER TABLE "User" ADD COLUMN "bannedById" TEXT;

ALTER TABLE "Post" ADD COLUMN "moderationReason" TEXT;
ALTER TABLE "Post" ADD COLUMN "moderatedById" TEXT;
ALTER TABLE "Post" ADD COLUMN "moderatedAt" TIMESTAMP(3);

-- --------------------------------------------------------------------------
-- Audit log
-- --------------------------------------------------------------------------

CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "reason" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");
CREATE INDEX "AuditLog_targetType_targetId_idx" ON "AuditLog"("targetType", "targetId");
CREATE INDEX "AuditLog_actorId_createdAt_idx" ON "AuditLog"("actorId", "createdAt");

ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey"
    FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
