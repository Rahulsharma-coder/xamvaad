-- Uploaded profile pictures.
--
-- Its own table so ordinary User queries never carry the image bytes. Stored
-- in Postgres rather than on disk: the app has no object storage, and a
-- container filesystem does not survive a redeploy.

CREATE TABLE "ProfileImage" (
    "userId" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "mimeType" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProfileImage_pkey" PRIMARY KEY ("userId")
);

ALTER TABLE "ProfileImage" ADD CONSTRAINT "ProfileImage_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
