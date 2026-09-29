-- Suggested examples, subjects, and task-size XP for the AI credit reviewer.
--
-- When a reviewer approves a submission at an XP or subject split that differs
-- from what the AI suggested, the approval saves a 'suggested' example
-- (services/credit_ai_review/calibration_capture.py). Only 'active' rows reach
-- the prompt; a person approves each suggestion in the grader's Tune AI XP
-- popup, because a one-off override (extra work done offline) would otherwise
-- teach the AI a rule nobody meant.
--
-- ai_xp and ai_subjects keep what the AI said, so the queue can show "AI 100,
-- you 25". xp is limited to the task sizes a reviewer can award
-- (config.constants.TASK_XP_SIZES). One example per completion.

ALTER TABLE public.credit_review_xp_examples
    ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active',
    ADD COLUMN IF NOT EXISTS subjects jsonb,
    ADD COLUMN IF NOT EXISTS ai_xp integer,
    ADD COLUMN IF NOT EXISTS ai_subjects jsonb;

UPDATE public.credit_review_xp_examples SET status = 'paused' WHERE NOT is_active;

ALTER TABLE public.credit_review_xp_examples
    DROP CONSTRAINT IF EXISTS credit_review_xp_examples_status_check,
    ADD CONSTRAINT credit_review_xp_examples_status_check
        CHECK (status IN ('suggested', 'active', 'paused')),
    DROP CONSTRAINT IF EXISTS credit_review_xp_examples_xp_check,
    ADD CONSTRAINT credit_review_xp_examples_xp_check
        CHECK (xp IN (25, 50, 75, 100, 150, 200)),
    ADD CONSTRAINT credit_review_xp_examples_subjects_check
        CHECK (subjects IS NULL OR jsonb_typeof(subjects) = 'object');

DROP INDEX IF EXISTS public.credit_review_xp_examples_active_idx;
ALTER TABLE public.credit_review_xp_examples DROP COLUMN IF EXISTS is_active;

CREATE INDEX IF NOT EXISTS credit_review_xp_examples_status_idx
    ON public.credit_review_xp_examples (status, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS credit_review_xp_examples_completion_uniq
    ON public.credit_review_xp_examples (completion_id) WHERE completion_id IS NOT NULL;
