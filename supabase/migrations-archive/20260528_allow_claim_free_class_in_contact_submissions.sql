-- Extend the contact_submissions.contact_type CHECK constraint to allow
-- 'claim_free_class', the lead type emitted by the "first class free" modal
-- on the /classes marketing page. Previously the modal silently 500'd because
-- the constraint rejected the row before any email send ran.

ALTER TABLE contact_submissions DROP CONSTRAINT IF EXISTS contact_submissions_contact_type_check;
ALTER TABLE contact_submissions
  ADD CONSTRAINT contact_submissions_contact_type_check
  CHECK (contact_type IN ('demo', 'sales', 'general', 'families', 'philosophy', 'academy', 'claim_free_class'));
