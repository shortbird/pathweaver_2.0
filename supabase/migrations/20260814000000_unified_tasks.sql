-- Unified Tasks: send a document out for signature, and track who signed.
--
-- iCreate, 2026-08-14: the office uploads a document (a handbook, a policy, a
-- contract), assigns it to a set of people, and wants one place showing who has
-- signed it. Today that flow exists only by convention — secure documents hold
-- the file, an onboarding checklist item holds the signature, and nothing joins
-- the two. Three columns close the gap; no new tables, no backfill.
--
-- The unified inbox that reads these (GET /api/sis/my-tasks) aggregates the
-- existing form/onboarding/ack tables at the API layer, so those are untouched.

-- 1. A one-item "sign this" assignment is not a checklist, and must not show up
--    in the checklist admin roll-up next to real onboarding templates. Existing
--    rows are checklists, which is what the default records.
ALTER TABLE public.sis_onboarding_assignments
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'checklist';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'valid_onboarding_kind'
  ) THEN
    ALTER TABLE public.sis_onboarding_assignments
      ADD CONSTRAINT valid_onboarding_kind
      CHECK (kind IN ('checklist', 'signature_request'));
  END IF;
END $$;

COMMENT ON COLUMN public.sis_onboarding_assignments.kind IS
  'checklist = an assigned onboarding template; signature_request = a single '
  'document sent out for signature (see services/sis_onboarding_service.send_for_signature).';

-- 2. "Sent the handbook to 12 people" is 12 assignment rows. batch_id is what
--    makes them one trackable send — grouping by template_name string-match
--    would merge two separate sends of the same document.
ALTER TABLE public.sis_onboarding_assignments
  ADD COLUMN IF NOT EXISTS batch_id uuid;

COMMENT ON COLUMN public.sis_onboarding_assignments.batch_id IS
  'Groups the per-person assignments created by one send-for-signature action.';

CREATE INDEX IF NOT EXISTS idx_sis_onboarding_assignments_batch
  ON public.sis_onboarding_assignments (organization_id, batch_id)
  WHERE batch_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sis_onboarding_assignments_org_kind
  ON public.sis_onboarding_assignments (organization_id, kind);

-- 3. Who may send a document depends on what is IN it, not which page it was
--    uploaded from. Campus coordinators run campus paperwork (permission slips,
--    handbooks) but never see HR paperwork (contracts, background checks) —
--    utils/sis_roles.HR_ROLES. Every row that exists today was uploaded through
--    the HR-gated store, so 'hr' is the only safe default: a coordinator must
--    not gain sight of the existing store by way of this migration.
ALTER TABLE public.sis_secure_documents
  ADD COLUMN IF NOT EXISTS sensitivity text NOT NULL DEFAULT 'hr';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'valid_secure_document_sensitivity'
  ) THEN
    ALTER TABLE public.sis_secure_documents
      ADD CONSTRAINT valid_secure_document_sensitivity
      CHECK (sensitivity IN ('hr', 'general'));
  END IF;
END $$;

COMMENT ON COLUMN public.sis_secure_documents.sensitivity IS
  'hr = employment/confidential paperwork, HR_ROLES only. general = ordinary '
  'campus paperwork a campus_coordinator may send and track (ADMIN_ROLES).';

CREATE INDEX IF NOT EXISTS idx_sis_secure_documents_org_sensitivity
  ON public.sis_secure_documents (organization_id, sensitivity);
