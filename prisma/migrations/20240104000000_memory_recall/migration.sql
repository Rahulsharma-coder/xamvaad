-- Removes the Doubtful Question post type and adds recall confidence to
-- Memory Questions.
--
-- Doubtful Question overlapped with both Discussion and Objection Question,
-- which left authors guessing which to choose. Existing posts of that type
-- become Discussions — no content is lost.

UPDATE "Post" SET "type" = 'DISCUSSION' WHERE "type" = 'DOUBTFUL_QUESTION';

-- Postgres cannot drop a value from an enum in place, so the type is rebuilt.
ALTER TYPE "PostType" RENAME TO "PostType_old";

CREATE TYPE "PostType" AS ENUM (
    'DISCUSSION',
    'POLL',
    'MEMORY_QUESTION',
    'EXPECTED_CUTOFF',
    'OFFICIAL_UPDATE',
    'OBJECTION_QUESTION'
);

ALTER TABLE "Post"
    ALTER COLUMN "type" TYPE "PostType" USING ("type"::text::"PostType");

DROP TYPE "PostType_old";

-- How well the author claims to recall the question's wording.
CREATE TYPE "RecallConfidence" AS ENUM ('EXACT', 'NEAR_EXACT', 'PARTIAL', 'ROUGH');

ALTER TABLE "Post" ADD COLUMN "recallConfidence" "RecallConfidence";
