-- Rename icreate_registrations -> registrations (EXPAND phase).
--
-- The parent registration funnel was built for iCreate and the name never
-- caught up. It has been org-neutral for a while — feature_flags.registration
-- was renamed off icreate_registration back in 20260527, and three orgs run the
-- funnel now (iCreate 101 registrations, Optio Academy 2, Gryffin 2) — so the
-- client's name on a shared table is simply wrong.
--
-- EXPAND/CONTRACT, because prod Render deploys and prod migrations are applied
-- separately (migrations by hand, deploys by release.yml) and local dev shares
-- the prod database. Between applying this and prod running the new code, the
-- DEPLOYED backend still queries icreate_registrations. So:
--
--   this migration      rename the table, leave a compatibility VIEW behind
--   ..._drop_compat     (CONTRACT, apply only once prod is on the new code)
--                       drops the view and renames the constraints
--
-- Deliberately NOT renamed here: the FK/PK constraint names. PostgREST infers
-- view relationships from the base table's constraints, and the deployed code
-- names one explicitly:
--     users!icreate_registrations_parent_user_id_fkey(email)
-- Renaming them now would break that embed for the deploy window. They get
-- their real names in the contract migration.

BEGIN;

ALTER TABLE public.icreate_registrations RENAME TO registrations;

ALTER INDEX public.idx_icreate_registrations_org RENAME TO idx_registrations_org;
ALTER INDEX public.idx_icreate_registrations_parent RENAME TO idx_registrations_parent;

-- Compatibility shim for the currently-deployed backend. A simple SELECT * view
-- is auto-updatable, so its INSERT/UPDATE/DELETE (with RETURNING, which is what
-- the supabase client relies on) all reach the base table.
--
-- security_invoker is NOT optional here. The base table has RLS enabled with no
-- policies at all, which is what confines these rows — kids' names, DOBs,
-- allergies, medications, home addresses — to the service-role backend. anon
-- and authenticated hold full table grants from the default-privileges
-- migration and are stopped by RLS alone. A normal view runs as its OWNER, so
-- without this the shim would hand anon everything the base table refuses.
CREATE VIEW public.icreate_registrations
  WITH (security_invoker = true) AS
  SELECT * FROM public.registrations;

-- Mirror the base table's grants (RLS still does the actual gating).
GRANT SELECT, INSERT, UPDATE, DELETE ON public.icreate_registrations
  TO anon, authenticated, service_role;

COMMENT ON VIEW public.icreate_registrations IS
  'Deprecated compatibility view for public.registrations, added 2026-08-25 so '
  'the deployed backend survives the rename. Drop once prod runs the renamed '
  'code — see 20260825160100_drop_icreate_registrations_compat.sql.';

COMMIT;

-- PostgREST caches the schema; without this the new table and the view are
-- invisible to the Data API until the next reload.
NOTIFY pgrst, 'reload schema';
