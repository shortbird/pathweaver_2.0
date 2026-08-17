-- Prior learning -> transcript. The bridge that was scaffolded and left unbuilt.
--
-- Accepting a prior-learning record wrote awarded_credits and stopped there:
-- the transcript is assembled from transfer_credits, user_subject_xp and
-- credit-awarded class quests (routes/admin/transcript_generator.py) and never
-- read prior_learning_records at all. So the office could accept "1.0 social
-- studies" and the student's transcript would not move.
--
-- Rather than teach the transcript a fourth source, an accepted record now
-- converts INTO a transfer_credits row. That is the same thing the office
-- already types by hand for a student arriving with a paper transcript, and it
-- is the only source the transcript treats correctly: transcript_generator
-- SUBTRACTS transfer XP from user_subject_xp to work out what was earned at
-- Optio, so credit that arrives any other way is misfiled as Optio-earned and
-- inflates earned credits.
--
-- One column, because merging is by school: several records naming the same
-- school accumulate into that school's single row, so the link is a list.
-- It carries the two things a bare "source" flag could not:
--
--   1. Idempotence. Converting a record twice is the accident that puts double
--      credit on a transcript, and it is invisible afterwards — the row just
--      reads 2.0 instead of 1.0. The conversion checks this array first.
--   2. Provenance. "Where did this 1.0 come from" is a question the office
--      will be asked by an accreditor, and the answer has to be a record with
--      the family's evidence attached, not an admin's memory.

ALTER TABLE public.transfer_credits
  ADD COLUMN IF NOT EXISTS prior_learning_record_ids uuid[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.transfer_credits.prior_learning_record_ids IS
  'prior_learning_records converted into this row. Empty for credits typed in '
  'by hand. Guards against converting the same record twice, and answers '
  '"which family submission is this credit from".';

-- The conversion looks a row up by (student, school) to merge, and looks up
-- "has this record already been converted" by membership. GIN serves the
-- second; the first is small enough per student to scan.
CREATE INDEX IF NOT EXISTS transfer_credits_prior_learning_ids_idx
  ON public.transfer_credits USING GIN (prior_learning_record_ids);
