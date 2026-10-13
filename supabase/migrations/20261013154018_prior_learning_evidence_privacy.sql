-- Accepted prior learning shows in the student's portfolio, documents and all
-- (Tanner, 2026-10-13: "show all. families are able to mark portfolio docs as
-- private"). This is the per-document switch, the same idea as
-- evidence_document_blocks.is_private on task evidence: a private document
-- stays on the record for the school and never reaches a portfolio view.

ALTER TABLE public.prior_learning_evidence
    ADD COLUMN IF NOT EXISTS is_private boolean NOT NULL DEFAULT false;
