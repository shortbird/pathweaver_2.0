-- Funding source + school-of-record on households (iCreate request 2026-07-27).
--
-- Background: `households.ufa_private` (boolean) conflated two ideas:
--   1. WHERE the student is enrolled (school of record) — for iCreate that is
--      "iCreate Academy", the org's private school.
--   2. HOW tuition is funded — Utah Fits All (UFA) used to pay private-school
--      tuition ("UFA Private School") vs plain UFA vs private pay.
-- iCreate noted "some iCreate Academy students are NOT with UFA private school"
-- (they pay privately), so these must be tracked separately.
--
-- We add an explicit funding_source and an enrolled_private_school flag, keep
-- ufa_private as the derived UFA-private mirror (the learning-day feature still
-- keys off it), and back-fill both from the existing boolean.

ALTER TABLE households ADD COLUMN IF NOT EXISTS funding_source text
  CHECK (funding_source IS NULL OR funding_source IN ('ufa', 'ufa_private', 'private_pay', 'other'));
ALTER TABLE households ADD COLUMN IF NOT EXISTS enrolled_private_school boolean NOT NULL DEFAULT false;

-- Back-fill: existing UFA-private families are enrolled in the private school
-- and funded by UFA-private.
UPDATE households
   SET funding_source = COALESCE(funding_source, 'ufa_private'),
       enrolled_private_school = true
 WHERE ufa_private = true;

-- The private school's display name lives in the org's branding_config so the
-- SIS labels it correctly per org (fallback "Private School" when unset).
UPDATE organizations
   SET branding_config = jsonb_set(
         COALESCE(branding_config, '{}'::jsonb),
         '{private_school_name}', '"iCreate Academy"', true)
 WHERE id = '1340004f-d12f-44ae-9ec3-185af5240130';
