-- ============================================================================
-- task_xp_held_for_acceptance: a school may hold task XP until a teacher
-- accepts the work in SIS Submissions.
-- ============================================================================
-- Ticket 536a3018, Jackie Hill (Arete Academy org admin): "Can you also make
-- it so the evidence submissions are not on their portfolios until I approve
-- it? And also have the xp not be awarded until it's approved?"
--
-- Opt-in per school: feature_flags.sis_settings.require_teacher_acceptance.
-- With it off nothing writes these columns, so every other school is
-- unchanged. See backend/services/teacher_acceptance.py.
--
-- xp_held_at      set when a completion is created and its XP is held back.
--                 Cleared when a teacher accepts (the accept awards the XP).
--                 While set, the work is also left off the portfolio and the
--                 diploma, and XP reconciliation does not count it as owed.
-- xp_released_at  set when an accept released a hold. Only these rows are
--                 taken back (XP reversed, xp_held_at set again) by a Grow
--                 This or an un-review after the accept. Work completed before
--                 a school turned the switch on never has it, so it is never
--                 touched -- the settings card promises that.
--
-- Additive, nullable, no default: existing rows read as "not held".
-- New columns inherit the table's Data API grants (no GRANT here).

ALTER TABLE public.quest_task_completions
  ADD COLUMN IF NOT EXISTS xp_held_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS xp_released_at timestamptz NULL;

COMMENT ON COLUMN public.quest_task_completions.xp_held_at IS
  'Set while the task XP waits for a teacher to accept the work (sis_settings.require_teacher_acceptance). NULL = not held.';
COMMENT ON COLUMN public.quest_task_completions.xp_released_at IS
  'Set when a teacher accept released a hold; a later Grow This or un-review re-holds only these rows.';

-- The held set is small and read per student (portfolio, quest page) and per
-- quest (XP reversal on quest delete).
CREATE INDEX IF NOT EXISTS idx_quest_task_completions_xp_held
  ON public.quest_task_completions (user_id)
  WHERE xp_held_at IS NOT NULL;
