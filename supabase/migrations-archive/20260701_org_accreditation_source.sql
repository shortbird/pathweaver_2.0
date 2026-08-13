-- WASC accreditation: per-organization transcript accreditation source.
--
-- Background: Optio Academy (Optio's own full-time online private school) is
-- accredited by ACS WASC. Some partner schools are NOT themselves accredited and
-- run a "distance learning" arrangement with Optio Academy so they can issue
-- accredited transcripts UNDER Optio's accreditation. Other partners (e.g.
-- OpenEd Academy) carry their OWN accreditation and must NOT display Optio's
-- WASC mark. This column records, per org, whose accreditation a student's
-- official transcript is issued under:
--
--   optio  -- transcript is issued under Optio Academy's ACS WASC accreditation.
--             Shows the WASC logo + phrase + commission identity block.
--   self   -- the org carries its own accreditation (renders its own branding).
--   none   -- no accredited transcript (default).
--
-- Platform-direct students (users.organization_id IS NULL) are Optio Academy
-- students and are resolved to 'optio' in the application layer
-- (backend/utils/accreditation.py) regardless of this column.
--
-- Additive, nullable-with-default -> no table rewrite, safe to apply anytime.

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS accreditation_source text NOT NULL DEFAULT 'none'
    CHECK (accreditation_source IN ('optio', 'self', 'none'));

COMMENT ON COLUMN organizations.accreditation_source IS
  'Whose accreditation an org student''s official transcript is issued under: '
  'optio (Optio Academy ACS WASC), self (org''s own accreditation), or none.';

-- Backfill guidance (adjust org names to your data, then run manually):
--
-- OpenEd Academy / Hearthwood carry their own accreditation:
--   UPDATE organizations SET accreditation_source = 'self'
--   WHERE slug IN ('hearthwood') OR name ILIKE '%OpenEd%';
--
-- Unaccredited partners issuing transcripts under Optio Academy's accreditation:
--   UPDATE organizations SET accreditation_source = 'optio'
--   WHERE slug IN ('<partner-slug>');
--
-- If "Optio Academy" is itself an organization row (rather than platform-direct
-- students), opt it in explicitly:
--   UPDATE organizations SET accreditation_source = 'optio'
--   WHERE name ILIKE 'Optio Academy';
