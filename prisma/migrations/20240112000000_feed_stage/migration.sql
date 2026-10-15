-- Feed entries that mark a lifecycle stage remember which stage and on which
-- phase, so an admin can finish the ones whose phase was unclear.

-- AlterTable
ALTER TABLE "FeedItem" ADD COLUMN     "stage" "ExamStage",
ADD COLUMN     "stageNote" TEXT,
ADD COLUMN     "stagePhaseId" TEXT;

