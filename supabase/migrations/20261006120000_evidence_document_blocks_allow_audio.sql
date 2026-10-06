-- Allow audio blocks on task evidence documents (2026-10-06).
--
-- Tickets 9040e599, 672adb58, 64c75285: the mobile TaskEvidenceSheet records
-- voice notes and saves them as block_type 'audio'. evidence_document_blocks
-- only allowed text/image/video/link/document, so every save that carried a
-- voice note failed the CHECK and the student saw a 500.
--
-- learning_event_evidence_blocks already allows 'audio' (the journal mirror of
-- these same blocks), so this brings the two block tables into line. The
-- backend now also rejects unknown block types with a 400 before the insert.

ALTER TABLE public.evidence_document_blocks
    DROP CONSTRAINT IF EXISTS evidence_document_blocks_block_type_check;

ALTER TABLE public.evidence_document_blocks
    ADD CONSTRAINT evidence_document_blocks_block_type_check
    CHECK (block_type = ANY (ARRAY['text'::text, 'image'::text, 'video'::text,
                                   'link'::text, 'document'::text, 'audio'::text]));
