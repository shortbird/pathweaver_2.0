-- Portals & Templates: onboarding templates can now target either staff (their
-- SIS console checklist) or families (their learning-app portal). Existing rows
-- default to 'staff'. The item-level `link` field is stored inside the existing
-- items jsonb, so no column is needed for it.
ALTER TABLE public.sis_onboarding_templates
  ADD COLUMN IF NOT EXISTS audience text NOT NULL DEFAULT 'staff';

COMMENT ON COLUMN public.sis_onboarding_templates.audience IS
  'Who the checklist is for: staff | family.';
