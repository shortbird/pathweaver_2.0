-- Archiving and deleting organizations from the admin dashboard.
--
-- Two columns and one function.
--
-- The columns record WHEN an org was archived and BY WHOM. `is_active` alone
-- already hid an org from every list (organization_repository.get_all_active,
-- get_by_slug, the public join-by-slug route), but it could not tell an org
-- that was deliberately retired from one that was never finished, so the
-- dashboard had nothing honest to show next to a Restore button.
--
-- The function answers the only question that makes a permanent delete safe:
-- what still points at this organization? 77 tables carry an FK to
-- organizations(id) -- a mix of ON DELETE CASCADE and ON DELETE SET NULL -- so
-- a DELETE on a live org silently destroys announcements, class materials,
-- discussion posts and the rest, with no undo. Rather than hardcode a table
-- list in Python that goes stale the first time somebody adds a table, this
-- reads information_schema, so a new organization_id column is covered the day
-- it ships.
--
-- Two tables are deliberately excluded from the blocking count:
--   admin_audit_logs    -- the record of what admins did outlives the org
--                          (its FK is ON DELETE SET NULL, so rows survive)
--   organization_secrets -- credentials scoped to the org; purged with it

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS archived_by uuid REFERENCES public.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.organizations.archived_at IS
  'When the org was archived. NULL for live orgs. Set alongside is_active = false.';
COMMENT ON COLUMN public.organizations.archived_by IS
  'Superadmin who archived the org.';

-- Live orgs are the common read; keep that index small.
CREATE INDEX IF NOT EXISTS idx_organizations_archived_at
  ON public.organizations (archived_at)
  WHERE archived_at IS NOT NULL;


CREATE OR REPLACE FUNCTION public.organization_content_summary(p_org_id uuid)
RETURNS TABLE (rel_name text, row_count bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  r record;
  n bigint;
BEGIN
  FOR r IN
    SELECT c.table_name AS t
    FROM information_schema.columns c
    JOIN information_schema.tables tb
      ON tb.table_schema = c.table_schema
     AND tb.table_name = c.table_name
    WHERE c.table_schema = 'public'
      AND c.column_name = 'organization_id'
      AND tb.table_type = 'BASE TABLE'
      AND c.table_name NOT IN ('admin_audit_logs', 'organization_secrets')
    ORDER BY c.table_name
  LOOP
    EXECUTE format(
      'SELECT count(*) FROM public.%I WHERE organization_id = $1', r.t
    ) INTO n USING p_org_id;

    IF n > 0 THEN
      rel_name := r.t;
      row_count := n;
      RETURN NEXT;
    END IF;
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.organization_content_summary(uuid) IS
  'Every public table still holding rows for this organization, with counts. '
  'Empty result means the org can be deleted without destroying data. '
  'Excludes admin_audit_logs (historical) and organization_secrets (purged with the org).';

-- Superadmin-only feature reached through the backend service role. Nothing
-- client-side should be able to enumerate row counts across every table.
REVOKE ALL ON FUNCTION public.organization_content_summary(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.organization_content_summary(uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.organization_content_summary(uuid) TO service_role;
