-- Worked XP examples for the AI credit reviewer.
--
-- The reviewer's "XP fits this work" line kept agreeing with inflated claims (a
-- two-sentence discussion comment passing at 100 XP). The rubric text lives in
-- ai_prompt_components (CREDIT_REVIEW_XP_GUIDE); these rows are the concrete
-- cases Optio's reviewers want it to match, added from the grader's Tune AI XP popup or
-- from the grader's "Save as example" button. Every active row goes into the
-- prompt (services/credit_ai_review/calibration.py), newest first, capped.
--
-- Service-role only: RLS on and no policies. Every caller is superadmin-gated
-- and runs on the admin client.

CREATE TABLE IF NOT EXISTS public.credit_review_xp_examples (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    work text NOT NULL CHECK (char_length(btrim(work)) BETWEEN 3 AND 300),
    xp integer NOT NULL CHECK (xp BETWEEN 25 AND 1000),
    note text CHECK (note IS NULL OR char_length(note) <= 300),
    completion_id uuid,
    is_active boolean NOT NULL DEFAULT true,
    created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS credit_review_xp_examples_active_idx
    ON public.credit_review_xp_examples (created_at DESC) WHERE is_active;

ALTER TABLE public.credit_review_xp_examples ENABLE ROW LEVEL SECURITY;

-- The first example, the case that started this.
INSERT INTO public.credit_review_xp_examples (work, xp, note)
VALUES ('A two-sentence comment in an online class discussion', 25,
        'A short written reply is a quick task, whatever XP was claimed.');
