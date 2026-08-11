-- Drop the marketing showcase feature (Aug 2026 admin panel cleanup).
-- Removes the consent-tracking tables, the users.can_view_showcase flag, and
-- the consent audit trigger. All application code was removed in the same
-- change (routes/showcase.py, routes/admin/showcase_consent.py,
-- repositories/showcase_repository.py, ShowcasePage, ShowcaseConsentPanel,
-- ShowcaseFamilySection, require_showcase_access).
--
-- DESTRUCTIVE: deletes all recorded showcase consent state and history.
-- The signed legal documents remain the offline source of truth.

DROP TABLE IF EXISTS showcase_posts;
DROP TABLE IF EXISTS showcase_evidence_status;
DROP TABLE IF EXISTS showcase_consent_history;
DROP TABLE IF EXISTS showcase_consent;

DROP FUNCTION IF EXISTS public.fn_showcase_consent_audit();

ALTER TABLE users DROP COLUMN IF EXISTS can_view_showcase;
