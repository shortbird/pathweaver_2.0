-- A teacher's verification of a student's task completion, for schools without
-- the SIS (routes/teacher_verification.py, the learning app's Verifications page).
--
-- The page shipped reading and writing four columns that were never created, so
-- its queue was empty and Approve always failed. SIS schools review in the
-- console's Submissions tab (sis_submission_reviews) and do not use these.
--
-- What a verification records, and nothing more: when, by whom, the teacher's
-- subject split for the task and a note. Credit and XP are still derived from
-- user_quest_tasks.subject_xp_distribution; nothing reads these for a transcript.

alter table public.quest_task_completions
  add column if not exists subject_verified_at timestamptz,
  add column if not exists verified_by_advisor_id uuid references public.users(id) on delete set null,
  add column if not exists subject_distribution jsonb,
  add column if not exists verification_notes text;

comment on column public.quest_task_completions.subject_verified_at is
  'When a teacher approved or rejected this completion on the Verifications page. NULL = not yet reviewed.';
comment on column public.quest_task_completions.verified_by_advisor_id is
  'The teacher who reviewed this completion on the Verifications page.';
comment on column public.quest_task_completions.subject_distribution is
  'The subject split the teacher approved, {subject: xp}. Not read by credit calculation.';
comment on column public.quest_task_completions.verification_notes is
  'The reviewing teacher''s note.';

-- The history page reads a teacher's own reviews, newest first.
create index if not exists idx_quest_task_completions_verified_by
  on public.quest_task_completions (verified_by_advisor_id, subject_verified_at desc)
  where verified_by_advisor_id is not null;
