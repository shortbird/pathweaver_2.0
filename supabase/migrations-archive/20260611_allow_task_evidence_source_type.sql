-- _sync_paired_learning_event (backend/routes/evidence_documents.py) mirrors
-- task evidence into the journal with source_type='task_evidence', but the
-- check constraint predates that value, so every mirror insert has been
-- failing silently (the sync is intentionally non-blocking) since the sync
-- shipped. Extend the allowlist.
ALTER TABLE public.learning_events
  DROP CONSTRAINT IF EXISTS learning_events_source_type_check;

ALTER TABLE public.learning_events
  ADD CONSTRAINT learning_events_source_type_check
  CHECK (source_type = ANY (ARRAY[
    'realtime'::text,
    'retroactive'::text,
    'parent_captured'::text,
    'task_evidence'::text
  ]));
