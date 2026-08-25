-- Rename icreate_registrations -> registrations (CONTRACT phase).
--
-- DO NOT APPLY until prod is running the renamed code. The view this drops is
-- the only thing keeping the previously-deployed backend alive; see the expand
-- migration (20260825160000) for the full reasoning.
--
-- How to know it is safe: no request has hit the compatibility view recently.
--   SELECT seq_scan, idx_scan FROM pg_stat_all_tables
--    WHERE relname = 'registrations';
-- and confirm the prod Render deploy for the rename is live and green.

BEGIN;

DROP VIEW IF EXISTS public.icreate_registrations;

-- Safe only now: nothing references these names once the view is gone. The
-- deployed code's PostgREST embed hint (users!icreate_registrations_parent_user_id_fkey)
-- was the reason to leave them alone during the expand phase.
ALTER TABLE public.registrations
  RENAME CONSTRAINT icreate_registrations_pkey TO registrations_pkey;
ALTER TABLE public.registrations
  RENAME CONSTRAINT icreate_registrations_organization_id_fkey TO registrations_organization_id_fkey;
ALTER TABLE public.registrations
  RENAME CONSTRAINT icreate_registrations_parent_user_id_fkey TO registrations_parent_user_id_fkey;
ALTER TABLE public.registrations
  RENAME CONSTRAINT icreate_registrations_status_check TO registrations_status_check;

COMMIT;

NOTIFY pgrst, 'reload schema';
