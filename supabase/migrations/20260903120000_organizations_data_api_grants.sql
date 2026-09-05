-- organizations: finish the C1 fix by taking back the WRITE grants it left behind.
--
-- WHAT 20260801_org_secrets_and_rls_gaps DID, AND WHAT IT MISSED
--
-- C1 was `organizations.feature_flags` holding live Stripe secret keys while the
-- `organizations_select` policy said `USING (is_active = true)` -- and RLS filters
-- rows, not columns, so the anon key (which ships in the public JS bundle) could
-- read the blob. The fix was a column-level grant: anon and authenticated may
-- SELECT the 15 safe columns and not `feature_flags`, `inbox_user_id`,
-- `archived_at` or `archived_by`. That part works, and is still the contract
-- asserted by ORG_PUBLIC_COLUMNS in scripts/audit_db_exposure.py.
--
-- What it missed is that the same roles kept every WRITE privilege, and kept it
-- across ALL 19 columns -- `feature_flags` included, the column the migration
-- existed to protect:
--
--     anon, authenticated:  INSERT / UPDATE / REFERENCES on all 19 columns
--                           DELETE / TRUNCATE / TRIGGER at table level
--
-- This is invisible from `information_schema.role_table_grants`, which shows
-- table-level grants only. A column-level SELECT does not appear there, so the
-- table reads as "writes but no SELECT" -- which is how it went unnoticed.
--
-- WHY IT MATTERS, PRECISELY
--
-- Most of it is redundant surface that RLS happens to hold shut: INSERT and
-- DELETE have no permissive policy (the one ALL policy,
-- `superadmin_can_manage_organizations`, tests `role = 'admin'`, which is not a
-- role this platform issues -- see the valid-roles table in CLAUDE.md -- so it
-- matches nobody), and UPDATE is gated by `org_admin_update_own_org`.
--
-- TRUNCATE is the exception, and it is the reason this is a fix rather than a
-- tidy-up: there is no such thing as a row-level policy on TRUNCATE. RLS cannot
-- gate it. A session running as anon or authenticated could empty the table.
--
-- WHY REVOKING IS SAFE
--
-- Every writer of this table in the backend holds the admin client:
-- routes/admin/organization_management.py, routes/announcements.py,
-- routes/sis/resources.py, routes/sis/schedule_sync.py,
-- services/organization_lifecycle.py, services/school_inbox_service.py and
-- services/sis_forms_service.py. service_role keeps its own grants and is
-- BYPASSRLS, so none of them change. Neither frontend talks to PostgREST for
-- data -- the Supabase client is used only for OAuth -- so nothing client-side
-- depends on the anon/authenticated writes either.
--
-- SHAPE OF THE STATEMENT
--
-- REVOKE ALL first, because a table-level REVOKE of a named privilege is not a
-- reliable way to clear the column-level grant of the same name; ALL clears both.
-- That also drops the SELECT we want to keep, so it is re-granted immediately --
-- which has the side benefit of stating the public column list in one place, in
-- the same terms as the audit script. Re-running is a no-op.

begin;

REVOKE ALL ON public.organizations FROM anon, authenticated;

-- The 15 columns that are safe to expose. Deliberately absent: feature_flags
-- (org config blob; used to carry the Stripe secret and is still read-modify-
-- written wholesale by the SIS console), inbox_user_id, archived_at, archived_by.
-- Keep in sync with ORG_PUBLIC_COLUMNS in scripts/audit_db_exposure.py.
GRANT SELECT (
  id,
  name,
  slug,
  is_active,
  timezone,
  branding_config,
  quest_visibility_policy,
  course_visibility_policy,
  accreditation_source,
  created_at,
  updated_at,
  ai_features_enabled,
  ai_chatbot_enabled,
  ai_lesson_helper_enabled,
  ai_task_generation_enabled
) ON public.organizations TO anon, authenticated;

commit;
