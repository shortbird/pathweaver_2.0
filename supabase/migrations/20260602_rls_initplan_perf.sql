-- ============================================================================
-- Performance: fix auth_rls_initplan (Supabase linter, 112 policies)
-- ============================================================================
-- RLS policies that call auth.uid() / auth.jwt() / auth.role() / current_setting()
-- directly re-evaluate the function once PER ROW. Wrapping the call in a scalar
-- subquery -- (select auth.uid()) -- makes Postgres evaluate it ONCE per
-- statement (an InitPlan), which is semantics-preserving (same return value)
-- and significantly faster on large tables.
--
-- This rewrites only the 112 policies that were still unwrapped; the ~182
-- already-optimized policies are skipped via the `!~* 'select auth.'` guard,
-- so the migration is safe to re-run (idempotent).
DO $$
DECLARE r record; stmt text; n int := 0;
BEGIN
  FOR r IN
    WITH cand AS (
      SELECT c.relname tbl, pol.polname,
             pg_get_expr(pol.polqual,pol.polrelid) q,
             pg_get_expr(pol.polwithcheck,pol.polrelid) w
      FROM pg_policy pol JOIN pg_class c ON c.oid=pol.polrelid
      JOIN pg_namespace n ON n.oid=c.relnamespace AND n.nspname='public'
      WHERE (coalesce(pg_get_expr(pol.polqual,pol.polrelid),'')||coalesce(pg_get_expr(pol.polwithcheck,pol.polrelid),'')) ~* 'auth\.(uid|jwt|role)\(\)|current_setting\('
        AND (coalesce(pg_get_expr(pol.polqual,pol.polrelid),'')||coalesce(pg_get_expr(pol.polwithcheck,pol.polrelid),'')) !~* 'select\s+auth\.|select\s+current_setting'
    )
    SELECT tbl, polname,
      CASE WHEN q IS NULL THEN NULL ELSE regexp_replace(regexp_replace(regexp_replace(regexp_replace(
          q,'auth\.uid\(\)','(select auth.uid())','gi'),'auth\.jwt\(\)','(select auth.jwt())','gi'),
          'auth\.role\(\)','(select auth.role())','gi'),'current_setting\(([^)]*)\)','(select current_setting(\1))','gi') END nq,
      CASE WHEN w IS NULL THEN NULL ELSE regexp_replace(regexp_replace(regexp_replace(regexp_replace(
          w,'auth\.uid\(\)','(select auth.uid())','gi'),'auth\.jwt\(\)','(select auth.jwt())','gi'),
          'auth\.role\(\)','(select auth.role())','gi'),'current_setting\(([^)]*)\)','(select current_setting(\1))','gi') END nw
    FROM cand
  LOOP
    stmt := format('ALTER POLICY %I ON public.%I', r.polname, r.tbl);
    IF r.nq IS NOT NULL THEN stmt := stmt || ' USING (' || r.nq || ')'; END IF;
    IF r.nw IS NOT NULL THEN stmt := stmt || ' WITH CHECK (' || r.nw || ')'; END IF;
    EXECUTE stmt;
    n := n + 1;
  END LOOP;
  RAISE NOTICE 'auth_rls_initplan: rewrote % policies', n;
END $$;

-- ----------------------------------------------------------------------------
-- NOT addressed (deliberately) -- see commit message / triage notes:
--   * multiple_permissive_policies (317): real but negligible at current scale
--     (largest table ~6k rows). Consolidating access-control policies is
--     semantics-sensitive; defer until a specific table is both large AND
--     shows up in slow-query logs.
--   * unindexed_foreign_keys (21): all on small/cold audit tables
--     (created_by/updated_by/reviewer_id, <1k rows). Index write cost is not
--     worth it; revisit per-table if one grows hot.
--   * unused_index (204): do NOT bulk-drop; idx_scan=0 is unreliable on a
--     young/low-traffic DB. Review against a long stats window first.
--   * no_primary_key (8): mostly backup_schema / log tables.
-- ----------------------------------------------------------------------------
