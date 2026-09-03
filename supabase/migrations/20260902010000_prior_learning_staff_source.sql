-- Prior learning: who filed the record.
--
-- Until now every record came from a guardian, so "who filed this" was answered
-- by submitted_by being a parent. It no longer is: the office receives paper and
-- emailed transcripts directly from a student's previous school, and had nowhere
-- to put them — an admin either sat on the PDF or asked the family to re-upload a
-- document the school already held.
--
-- Staff-entered records go through the exact same queue, analyzer and transcript
-- conversion as family ones. The only thing that differs is provenance, and that
-- is a question an accreditor asks out loud ("where did this 1.0 come from") — so
-- it is stored, not derived. Deriving it from the submitter's current role would
-- silently relabel old family records the day a parent joins the staff.
--
-- The family surface reads by submitted_by, so staff records simply don't appear
-- there; nothing about this column changes what a guardian can see or do.

ALTER TABLE public.prior_learning_records
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'family'
  CHECK (source IN ('family', 'staff'));

COMMENT ON COLUMN public.prior_learning_records.source IS
  'Who filed this record: family (a guardian uploaded it) or staff (the office '
  'received the document from the school it came from and entered it). Stored '
  'rather than derived from submitted_by, whose role can change.';
