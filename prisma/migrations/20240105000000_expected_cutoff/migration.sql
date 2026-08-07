-- Structured Expected Cutoff posts.
--
-- The author publishes predicted marks per reservation category; readers add
-- their own prediction, so a post aggregates into a community median and range
-- instead of remaining one person's opinion in prose.

CREATE TYPE "ExamCategory" AS ENUM ('GENERAL', 'EWS', 'OBC', 'SC', 'ST');

CREATE TYPE "CutoffBasis" AS ENUM ('MULTI_SHIFT', 'OWN_SHIFT', 'COACHING', 'GUESS');

ALTER TABLE "Post" ADD COLUMN "cutoffBasis" "CutoffBasis";

CREATE TABLE "CutoffPrediction" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "category" "ExamCategory" NOT NULL,
    "marks" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "CutoffPrediction_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CutoffEstimate" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "category" "ExamCategory" NOT NULL,
    "marks" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CutoffEstimate_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CutoffPrediction_postId_idx" ON "CutoffPrediction"("postId");
CREATE UNIQUE INDEX "CutoffPrediction_postId_category_key" ON "CutoffPrediction"("postId", "category");

CREATE INDEX "CutoffEstimate_postId_category_idx" ON "CutoffEstimate"("postId", "category");
CREATE UNIQUE INDEX "CutoffEstimate_postId_userId_key" ON "CutoffEstimate"("postId", "userId");

ALTER TABLE "CutoffPrediction" ADD CONSTRAINT "CutoffPrediction_postId_fkey"
    FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CutoffEstimate" ADD CONSTRAINT "CutoffEstimate_postId_fkey"
    FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CutoffEstimate" ADD CONSTRAINT "CutoffEstimate_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
