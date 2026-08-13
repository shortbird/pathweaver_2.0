-- Allow 'audio' as a learning-moment evidence block type.
--
-- Voice-note moments (frontend-v2 VoiceRecorder) upload an .m4a and insert a
-- block with block_type='audio'. The backend already treats 'audio' as valid
-- (routes/parent/learning_moments.py valid_block_types) and media_upload_service
-- supports it, but the table's CHECK constraint never included 'audio', so the
-- insert failed with 23514 (check_violation). This adds 'audio' to the allowed
-- set. Purely additive — no existing rows are affected.

ALTER TABLE public.learning_event_evidence_blocks
  DROP CONSTRAINT IF EXISTS learning_event_evidence_blocks_block_type_check;

ALTER TABLE public.learning_event_evidence_blocks
  ADD CONSTRAINT learning_event_evidence_blocks_block_type_check
  CHECK (block_type = ANY (ARRAY['text'::text, 'image'::text, 'video'::text, 'link'::text, 'document'::text, 'audio'::text]));
