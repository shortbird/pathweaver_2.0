-- The AI credit reviewer's working notes.
--
-- One row per diploma_review_rounds row. Deliberately its own table rather than
-- columns on the round: GET /api/tasks/<id>/credit-history hands a student
-- `select('*')` of their own rounds (backend/routes/tasks/credit.py), so an
-- ai_review column would have shipped the model's verdict, its confidence and
-- its "the XP they asked for is too high" opinion straight to the student it is
-- about. A separate service-role-only table cannot leak that way by accident.
--
-- The AI proposes; a superadmin decides. Nothing here awards credit or XP.

CREATE TABLE IF NOT EXISTS public.credit_ai_reviews (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id       uuid NOT NULL UNIQUE REFERENCES public.diploma_review_rounds(id) ON DELETE CASCADE,
  completion_id  uuid NOT NULL REFERENCES public.quest_task_completions(id) ON DELETE CASCADE,
  status         text NOT NULL DEFAULT 'queued'
                 CHECK (status IN ('queued','running','complete','failed','skipped')),
  -- ai_disabled_for_student | no_readable_evidence | completion_not_pending | feature_disabled
  skip_reason    text,
  review         jsonb,
  model          text,
  prompt_version text,
  usage          jsonb,
  error          text,
  attempts       integer NOT NULL DEFAULT 0,
  -- Held by whoever won the queued -> running race. Every write-back filters on
  -- it, so a zombie worker that finishes after its row was re-claimed cannot
  -- overwrite the newer result.
  claim_token    uuid,
  started_at     timestamptz,
  reviewed_at    timestamptz,
  requested_by   uuid REFERENCES public.users(id) ON DELETE SET NULL,  -- NULL = automatic run
  -- What the reviewer actually took from the draft. This is the only honest
  -- measure of whether the AI is worth running.
  accepted_feedback text,
  accepted_xp    boolean,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_credit_ai_reviews_pending
  ON public.credit_ai_reviews (created_at) WHERE status IN ('queued','running');
CREATE INDEX IF NOT EXISTS idx_credit_ai_reviews_completion
  ON public.credit_ai_reviews (completion_id);

DROP TRIGGER IF EXISTS trigger_credit_ai_reviews_updated_at ON public.credit_ai_reviews;
CREATE TRIGGER trigger_credit_ai_reviews_updated_at
  BEFORE UPDATE ON public.credit_ai_reviews
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.credit_ai_reviews ENABLE ROW LEVEL SECURITY;

-- Service role only, on purpose. No student, parent, advisor or org_admin
-- policy: these are superadmin working notes, and the review UI reads them
-- through the admin client behind @require_role('superadmin').
DROP POLICY IF EXISTS "Service role full access to credit ai reviews" ON public.credit_ai_reviews;
CREATE POLICY "Service role full access to credit ai reviews"
  ON public.credit_ai_reviews FOR ALL TO public
  USING ((SELECT auth.role()) = 'service_role');

-- Backfill: queue the latest round of everything still waiting on a human, so
-- the feature arrives with the existing queue already read rather than only
-- helping with submissions filed after the deploy.
INSERT INTO public.credit_ai_reviews (round_id, completion_id, status)
SELECT DISTINCT ON (r.completion_id) r.id, r.completion_id, 'queued'
  FROM public.diploma_review_rounds r
  JOIN public.quest_task_completions c ON c.id = r.completion_id
 WHERE c.diploma_status IN ('pending_review','pending_org_approval')
 ORDER BY r.completion_id, r.round_number DESC
ON CONFLICT (round_id) DO NOTHING;

-- Provenance for XP changes. sis_xp_adjustments was built for the SIS teacher
-- override; the credit dashboard now writes to it too, and organization_id is
-- already nullable there because a platform student has no org.
ALTER TABLE public.sis_xp_adjustments
  ADD COLUMN IF NOT EXISTS source text,
  ADD COLUMN IF NOT EXISTS completion_id uuid;

COMMENT ON TABLE public.credit_ai_reviews IS
  'AI credit-review proposals. Superadmin-only working notes; never awards credit.';
