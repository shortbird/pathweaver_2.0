-- Family-level class-registration gates + pre-staged directives for the iCreate
-- legacy-registration migration.
--
-- 1) households.registration_hold / registration_tier — enforced in
--    sis_parent_service on every self-service add (schedule builder + cart).
--    Tier open dates live in feature_flags.sis_settings.registration_tier_dates
--    ({"1": "YYYY-MM-DD", "2": ..., "3": ..., "default": ...}); no config = no gate.
--
-- 2) sis_family_directives — settings staged BY PARENT EMAIL before the family
--    exists in the SIS. The iCreate registration funnel looks the parent's email
--    up here at the family step: fee_prepaid skips the registration fee, and
--    tier/hold are copied onto the household it creates. Loaded from the school's
--    legacy registration spreadsheet (scripts/import_icreate_family_directives.py).

ALTER TABLE households
  ADD COLUMN IF NOT EXISTS registration_hold boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS registration_hold_reason text,
  ADD COLUMN IF NOT EXISTS registration_tier smallint;

COMMENT ON COLUMN households.registration_hold IS
  'Blocks parent self-service class signup for the whole family until staff clear it.';
COMMENT ON COLUMN households.registration_tier IS
  'Priority tier for staggered class-registration opening (dates in feature_flags.sis_settings.registration_tier_dates). NULL = the default/open tier.';

CREATE TABLE IF NOT EXISTS sis_family_directives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email text NOT NULL,
  registration_tier smallint,
  registration_hold boolean NOT NULL DEFAULT false,
  hold_reason text,
  fee_prepaid boolean NOT NULL DEFAULT false,
  notes text,
  matched_household_id uuid REFERENCES households(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, email)
);

COMMENT ON TABLE sis_family_directives IS
  'Per-parent-email settings staged before a family registers: prepaid legacy fee, registration hold, priority tier. Applied by the iCreate funnel when the household is created (matched_household_id records the match).';

-- Backend-only access, same posture as the other SIS tables.
ALTER TABLE sis_family_directives ENABLE ROW LEVEL SECURITY;
