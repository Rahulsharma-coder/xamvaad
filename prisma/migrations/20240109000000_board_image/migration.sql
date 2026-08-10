-- Board logos, stored in the database like profile pictures.
-- The bytes live in their own table so listing boards never carries them.

-- AlterTable
ALTER TABLE "Board" ADD COLUMN "image" TEXT;

-- CreateTable
CREATE TABLE "BoardImage" (
    "boardId" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "mimeType" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BoardImage_pkey" PRIMARY KEY ("boardId")
);

-- AddForeignKey
ALTER TABLE "BoardImage" ADD CONSTRAINT "BoardImage_boardId_fkey" FOREIGN KEY ("boardId") REFERENCES "Board"("id") ON DELETE CASCADE ON UPDATE CASCADE;
