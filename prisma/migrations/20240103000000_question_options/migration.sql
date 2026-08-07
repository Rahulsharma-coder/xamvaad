-- Question options and community marks.
--
-- An Objection Question now carries the four lettered choices and records what
-- each user marked in the exam, separately from whether they think the answer
-- should be challenged.

CREATE TABLE "QuestionOption" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "markCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "QuestionOption_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "QuestionMark" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "optionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuestionMark_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "QuestionOption_questionId_sortOrder_idx" ON "QuestionOption"("questionId", "sortOrder");
CREATE UNIQUE INDEX "QuestionOption_questionId_label_key" ON "QuestionOption"("questionId", "label");

CREATE INDEX "QuestionMark_optionId_idx" ON "QuestionMark"("optionId");
CREATE UNIQUE INDEX "QuestionMark_questionId_userId_key" ON "QuestionMark"("questionId", "userId");

ALTER TABLE "QuestionOption" ADD CONSTRAINT "QuestionOption_questionId_fkey"
    FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "QuestionMark" ADD CONSTRAINT "QuestionMark_questionId_fkey"
    FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "QuestionMark" ADD CONSTRAINT "QuestionMark_optionId_fkey"
    FOREIGN KEY ("optionId") REFERENCES "QuestionOption"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "QuestionMark" ADD CONSTRAINT "QuestionMark_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
