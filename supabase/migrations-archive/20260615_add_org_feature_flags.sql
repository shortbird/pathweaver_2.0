-- Per-organization feature flags
--
-- Generic capability gates so a feature can be turned on for one organization
-- without hardcoding the org's slug in code (unlike the slug-gated Treehouse/OEA
-- program tabs). Absent or false = off. Reusable across future microschools.
--
-- Example: {"scheduled_publish": true, "due_dates": true}
--
-- RLS is unchanged; the backend (service_role) reads these flags. Additive,
-- nullable-safe: existing orgs default to {} (all features off).

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS feature_flags jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN organizations.feature_flags IS
  'Per-org capability gates, e.g. {"scheduled_publish": true}. Absent/false = off. Gated UI/writes only; reusable across microschools.';
