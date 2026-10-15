-- Official Updates from the Sarkari Result feed.
-- Exams gain the phrases that identify them in the feed, posts gain the
-- official link they announce, and FeedItem records every entry looked at.

-- CreateEnum
CREATE TYPE "FeedItemStatus" AS ENUM ('PROCESSING', 'PUBLISHED', 'NO_EXAM_MATCH', 'AMBIGUOUS', 'OTHER_YEAR', 'UNKNOWN_TYPE', 'NO_OFFICIAL_LINK', 'FAILED');

-- AlterTable
ALTER TABLE "Exam" ADD COLUMN     "feedKeywords" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "Post" ADD COLUMN     "sourceUrl" TEXT;

-- CreateTable
CREATE TABLE "FeedItem" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "kind" TEXT,
    "status" "FeedItemStatus" NOT NULL,
    "examId" TEXT,
    "postId" TEXT,
    "officialUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeedItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FeedItem_key_key" ON "FeedItem"("key");

-- CreateIndex
CREATE INDEX "FeedItem_createdAt_idx" ON "FeedItem"("createdAt");

-- AddForeignKey
ALTER TABLE "FeedItem" ADD CONSTRAINT "FeedItem_examId_fkey" FOREIGN KEY ("examId") REFERENCES "Exam"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Starting phrases for the exams that already exist. Matched as whole words
-- against the feed title; admins edit them on the exam's admin page.
UPDATE "Exam" SET "feedKeywords" = ARRAY['SSC CGL', 'SSC Combined Graduate Level'] WHERE "slug" = 'combined-graduate-level';
UPDATE "Exam" SET "feedKeywords" = ARRAY['RRB NTPC 10+2', 'RRB NTPC Under Graduate', 'RRB NTPC UG'] WHERE "slug" = 'rrb-ntpc-ug';
UPDATE "Exam" SET "feedKeywords" = ARRAY['RRB NTPC Graduate'] WHERE "slug" = 'rrb-ntpc-graduate';
UPDATE "Exam" SET "feedKeywords" = ARRAY['RRB Group D'] WHERE "slug" = 'rrb-group-d-2026';
UPDATE "Exam" SET "feedKeywords" = ARRAY['SSC Combined Hindi Translator', 'SSC Hindi Translator', 'SSC JHT', 'SSC CHT'] WHERE "slug" = 'combined-hindi-translator-exam';
UPDATE "Exam" SET "feedKeywords" = ARRAY['SSC Stenographer', 'SSC Steno'] WHERE "slug" = 'ssc-stenographer-grade-c-and-d';
UPDATE "Exam" SET "feedKeywords" = ARRAY['RPSC RAS'] WHERE "slug" = 'rpsc-ras-2026';
UPDATE "Exam" SET "feedKeywords" = ARRAY['Rajasthan Police Constable'] WHERE "slug" = 'rajasthan-police-constable-2026';
UPDATE "Exam" SET "feedKeywords" = ARRAY['RSSB CET Graduate', 'Rajasthan CET Graduate'] WHERE "slug" = 'rssb-cet-graduate-2026';
UPDATE "Exam" SET "feedKeywords" = ARRAY['RSSB CET 10+2', 'Rajasthan CET 10+2', 'Rajasthan CET Senior Secondary'] WHERE "slug" = 'rajasthan-cet102-exam';
UPDATE "Exam" SET "feedKeywords" = ARRAY['RSSB VDO', 'Rajasthan VDO'] WHERE "slug" = 'rssb-vdo-2026';
UPDATE "Exam" SET "feedKeywords" = ARRAY['RSSB Patwari', 'Rajasthan Patwari'] WHERE "slug" = 'rssb-patwari-2026';
UPDATE "Exam" SET "feedKeywords" = ARRAY['Rajasthan REET', 'RBSE REET', '-Mains'] WHERE "slug" = 'reet-2026';
