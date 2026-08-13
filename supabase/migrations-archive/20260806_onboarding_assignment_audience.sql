-- Onboarding assignments carry the audience they were assigned for.
--
-- Reported 2026-08-05: "in the learning app/family portal, it has the teacher
-- onboarding template, lol." The family portal listed every assignment held by
-- the guardian's user id, and an iCreate admin who is also staff holds both. The
-- audience lived only on the template, and template_id is ON DELETE SET NULL, so
-- reading it back through the join would lose the answer the moment a template
-- was deleted. Snapshot it onto the assignment instead, the same way items are
-- snapshotted at assign time.

ALTER TABLE public.sis_onboarding_assignments
  ADD COLUMN IF NOT EXISTS audience text NOT NULL DEFAULT 'staff';

-- Backfill from the template that produced each assignment. Rows whose template
-- is already gone keep the 'staff' default, which is what they were before this
-- column existed (family templates arrived later than the staff ones).
UPDATE public.sis_onboarding_assignments a
   SET audience = t.audience
  FROM public.sis_onboarding_templates t
 WHERE a.template_id = t.id
   AND t.audience IS DISTINCT FROM a.audience;

ALTER TABLE public.sis_onboarding_assignments
  ADD CONSTRAINT sis_onboarding_assignments_audience_check
  CHECK (audience IN ('staff', 'family'));

CREATE INDEX IF NOT EXISTS idx_sis_onboarding_assignments_user_audience
  ON public.sis_onboarding_assignments (user_id, audience);
