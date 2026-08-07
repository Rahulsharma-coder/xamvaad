-- Adds the Objection Question post type.
--
-- Posts of this type challenge a specific question's official answer and carry
-- the objection meter. They may only be created while the exam's objection
-- window is open (enforced in the API, not the schema, because the window is
-- data rather than structure).

ALTER TYPE "PostType" ADD VALUE 'OBJECTION_QUESTION';
