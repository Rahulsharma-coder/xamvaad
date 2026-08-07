-- Multi-phase exams.
--
-- Almost every competitive exam is several exams inside one: SSC CGL has
-- Tier 1 and Tier 2, RRB NTPC has CBT 1, CBT 2 and DV, IBPS PO has Prelims,
-- Mains and Interview. Each runs on its own dates and opens its own objection
-- window months apart, but `ExamStageEntry` was UNIQUE(examId, stage) — one
-- lifecycle per exam, so recording Tier 2 would overwrite Tier 1's history.
--
-- Lifecycles and sittings move onto a new ExamPhase. Every existing exam gets
-- one phase and keeps everything it had, so no data is lost.

-- --------------------------------------------------------------------------
-- 1. The phase itself
-- --------------------------------------------------------------------------

CREATE TYPE "PhaseKind" AS ENUM (
    'WRITTEN',
    'SKILL_TEST',
    'PHYSICAL',
    'INTERVIEW',
    'DOCUMENT_VERIFICATION'
);

CREATE TABLE "ExamPhase" (
    "id" TEXT NOT NULL,
    "examId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "shortName" TEXT NOT NULL,
    "kind" "PhaseKind" NOT NULL DEFAULT 'WRITTEN',
    "sequence" INTEGER NOT NULL DEFAULT 1,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExamPhase_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ExamPhase_examId_slug_key" ON "ExamPhase"("examId", "slug");
CREATE UNIQUE INDEX "ExamPhase_examId_sequence_key" ON "ExamPhase"("examId", "sequence");
CREATE INDEX "ExamPhase_examId_sequence_idx" ON "ExamPhase"("examId", "sequence");

ALTER TABLE "ExamPhase" ADD CONSTRAINT "ExamPhase_examId_fkey"
    FOREIGN KEY ("examId") REFERENCES "Exam"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- --------------------------------------------------------------------------
-- 2. Give every existing exam a phase to hang its current data on
-- --------------------------------------------------------------------------
--
-- Named neutrally: the seed replaces these with real tiers, and a board-aware
-- guess ("Tier 1" for SSC, "Prelims" for banking) does not belong in SQL.

INSERT INTO "ExamPhase" ("id", "examId", "slug", "name", "shortName", "kind", "sequence")
SELECT
    'phase_' || "id",
    "id",
    'main',
    'Main Exam',
    'Main',
    'WRITTEN',
    1
FROM "Exam";

-- --------------------------------------------------------------------------
-- 3. Move sittings onto phases
-- --------------------------------------------------------------------------

ALTER TABLE "ExamSession" ADD COLUMN "phaseId" TEXT;

UPDATE "ExamSession" s
   SET "phaseId" = p."id"
  FROM "ExamPhase" p
 WHERE p."examId" = s."examId";

ALTER TABLE "ExamSession" ALTER COLUMN "phaseId" SET NOT NULL;

-- Shifts are unique within a phase now: Tier 1 and Tier 2 may both hold a
-- "Shift 1", and one day could in principle host two phases.
DROP INDEX IF EXISTS "ExamSession_examId_date_shift_key";
CREATE UNIQUE INDEX "ExamSession_phaseId_date_shift_key" ON "ExamSession"("phaseId", "date", "shift");
CREATE INDEX "ExamSession_phaseId_date_idx" ON "ExamSession"("phaseId", "date");

ALTER TABLE "ExamSession" ADD CONSTRAINT "ExamSession_phaseId_fkey"
    FOREIGN KEY ("phaseId") REFERENCES "ExamPhase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- --------------------------------------------------------------------------
-- 4. Move lifecycles onto phases — the change this migration exists for
-- --------------------------------------------------------------------------

ALTER TABLE "ExamStageEntry" ADD COLUMN "phaseId" TEXT;

UPDATE "ExamStageEntry" e
   SET "phaseId" = p."id"
  FROM "ExamPhase" p
 WHERE p."examId" = e."examId";

ALTER TABLE "ExamStageEntry" ALTER COLUMN "phaseId" SET NOT NULL;

ALTER TABLE "ExamStageEntry" DROP CONSTRAINT IF EXISTS "ExamStageEntry_examId_fkey";
DROP INDEX IF EXISTS "ExamStageEntry_examId_stage_key";
DROP INDEX IF EXISTS "ExamStageEntry_examId_sortOrder_idx";
ALTER TABLE "ExamStageEntry" DROP COLUMN "examId";

CREATE UNIQUE INDEX "ExamStageEntry_phaseId_stage_key" ON "ExamStageEntry"("phaseId", "stage");
CREATE INDEX "ExamStageEntry_phaseId_sortOrder_idx" ON "ExamStageEntry"("phaseId", "sortOrder");

ALTER TABLE "ExamStageEntry" ADD CONSTRAINT "ExamStageEntry_phaseId_fkey"
    FOREIGN KEY ("phaseId") REFERENCES "ExamPhase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- --------------------------------------------------------------------------
-- 5. Questions and posts learn which phase they belong to
-- --------------------------------------------------------------------------

ALTER TABLE "Question" ADD COLUMN "phaseId" TEXT;

UPDATE "Question" q
   SET "phaseId" = s."phaseId"
  FROM "ExamSession" s
 WHERE s."id" = q."sessionId";

ALTER TABLE "Question" ALTER COLUMN "phaseId" SET NOT NULL;

ALTER TABLE "Question" ADD CONSTRAINT "Question_phaseId_fkey"
    FOREIGN KEY ("phaseId") REFERENCES "ExamPhase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Nullable: a post may genuinely span the whole exam rather than one tier.
ALTER TABLE "Post" ADD COLUMN "phaseId" TEXT;

UPDATE "Post" p
   SET "phaseId" = s."phaseId"
  FROM "ExamSession" s
 WHERE s."id" = p."sessionId";

ALTER TABLE "Post" ADD CONSTRAINT "Post_phaseId_fkey"
    FOREIGN KEY ("phaseId") REFERENCES "ExamPhase"("id") ON DELETE SET NULL ON UPDATE CASCADE;
