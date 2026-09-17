-- One family hold (M2, docs/sis/CONSOLIDATION_PLAN.md).
--
-- The unpaid-fee hold was recognised by comparing the hold's free-text reason
-- to a sentence (sis_enrollment_waitlist_service.FEE_HOLD_REASON) in three
-- places, so an admin editing the reason text on the Families page made the
-- hold un-clearable. The kind of hold gets its own column; the reason stays
-- what the family reads.
ALTER TABLE public.households
  ADD COLUMN IF NOT EXISTS registration_hold_code text;

ALTER TABLE public.households
  DROP CONSTRAINT IF EXISTS households_registration_hold_code_check;
ALTER TABLE public.households
  ADD CONSTRAINT households_registration_hold_code_check
  CHECK (registration_hold_code IS NULL
         OR registration_hold_code IN ('unpaid_fee', 'manual', 'enrollment_waitlist'));

-- Backfill: today's fee holds carry the sentence; everything else held was
-- set by staff.
UPDATE public.households
   SET registration_hold_code = CASE
         WHEN registration_hold_reason = 'Registration fee due — finish it from your registration page.'
           THEN 'unpaid_fee'
         ELSE 'manual'
       END
 WHERE registration_hold = true
   AND registration_hold_code IS NULL;

-- A directive is a pre-household staging area, applied ONCE when the family's
-- household is attached (sis_holds.apply_directives); applied_at says when.
ALTER TABLE public.sis_family_directives
  ADD COLUMN IF NOT EXISTS applied_at timestamp with time zone;

UPDATE public.sis_family_directives
   SET applied_at = updated_at
 WHERE matched_household_id IS NOT NULL
   AND applied_at IS NULL;
