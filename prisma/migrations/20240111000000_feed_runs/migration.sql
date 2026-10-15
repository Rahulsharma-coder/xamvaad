-- One row per run of the official-feed job, so a blocked or broken feed
-- shows up on the admin dashboard instead of failing silently.

-- CreateEnum
CREATE TYPE "FeedRunStatus" AS ENUM ('OK', 'BLOCKED', 'UNREACHABLE', 'FAILED');

-- CreateTable
CREATE TABLE "FeedRun" (
    "id" TEXT NOT NULL,
    "status" "FeedRunStatus" NOT NULL,
    "error" TEXT,
    "httpStatus" INTEGER,
    "published" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeedRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FeedRun_createdAt_idx" ON "FeedRun"("createdAt");
