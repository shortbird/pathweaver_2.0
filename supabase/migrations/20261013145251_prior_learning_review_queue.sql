-- Prior learning review queue, rebuilt (2026-10-13).
--
-- Two additions:
--
-- 1. status 'needs_info'. The reviewer sends a record back to the family with a
--    note ("the transcript is missing page 2"). The family's copy unlocks, they
--    add documents and send it again, and it returns to the queue as
--    'submitted'. Before this the only answers were accept and reject, so a
--    record missing one page was either rejected (and the family started over)
--    or parked in review while somebody emailed the family by hand.
--
-- 2. prior_learning_events: the history of one record -- submitted, analyzed,
--    documents added, sent back, decided, transcribed -- and the reviewer's
--    internal notes (kind 'note'), which the family never sees. Notes live
--    here rather than in review_notes because review_notes is the text the
--    family reads.
--
-- Read and written only by the backend (admin client), so RLS is on with no
-- policies, the same as prior_learning_records.

ALTER TABLE public.prior_learning_records
    DROP CONSTRAINT IF EXISTS prior_learning_records_status_check;
ALTER TABLE public.prior_learning_records
    ADD CONSTRAINT prior_learning_records_status_check
    CHECK (status IN ('draft', 'submitted', 'under_review', 'needs_info', 'accepted', 'rejected'));

CREATE TABLE IF NOT EXISTS public.prior_learning_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    record_id uuid NOT NULL REFERENCES public.prior_learning_records(id) ON DELETE CASCADE,
    actor_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
    kind text NOT NULL CHECK (kind IN (
        'submitted', 'resubmitted', 'filed', 'evidence_added', 'evidence_removed',
        'analyzed', 'analysis_failed', 'status_changed', 'info_requested',
        'note', 'transcribed'
    )),
    body text,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS prior_learning_events_record
    ON public.prior_learning_events (record_id, created_at);

ALTER TABLE public.prior_learning_events ENABLE ROW LEVEL SECURITY;

-- The queue sorts students by how long their oldest record has waited, and
-- the analyze sweep looks for queued records.
CREATE INDEX IF NOT EXISTS prior_learning_records_status_created
    ON public.prior_learning_records (status, created_at);
CREATE INDEX IF NOT EXISTS prior_learning_records_ai_status
    ON public.prior_learning_records (ai_status) WHERE ai_status IN ('queued', 'running');
