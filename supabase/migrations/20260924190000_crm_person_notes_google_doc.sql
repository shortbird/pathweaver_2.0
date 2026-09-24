-- A person note can carry the Google Doc the meeting notes were written in.
-- The link is the source; doc_text is a plain-text copy taken when the note
-- was saved (or refreshed), so the file still reads after the doc is moved or
-- unshared. All nullable: a note without a doc is unchanged.
ALTER TABLE public.crm_person_notes
    ADD COLUMN IF NOT EXISTS doc_url text,
    ADD COLUMN IF NOT EXISTS doc_title text,
    ADD COLUMN IF NOT EXISTS doc_text text,
    ADD COLUMN IF NOT EXISTS doc_fetched_at timestamptz;
