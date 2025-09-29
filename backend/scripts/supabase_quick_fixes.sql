-- =============================================
-- SUPABASE DATABASE OPTIMIZATION - QUICK FIXES
-- =============================================
-- Run this in Supabase SQL Editor
-- These are the safest optimizations to apply immediately
-- =============================================

-- 1. Fix duplicate index (immediate improvement, no risk)
DROP INDEX IF EXISTS idx_ai_quest_review_history_generated_quest_id;

-- 2. Generate auth RLS optimization queries
-- Copy and run the results of this query to fix auth performance issues
WITH policy_fixes AS (
  SELECT
    schemaname,
    tablename,
    policyname,
    cmd,
    CASE
      WHEN qual IS NOT NULL THEN
        REPLACE(
          REPLACE(qual, 'auth.uid()', '(select auth.uid())'),
          'auth.jwt()', '(select auth.jwt())'
        )
      ELSE NULL
    END as fixed_qual,
    CASE
      WHEN with_check IS NOT NULL THEN
        REPLACE(
          REPLACE(with_check, 'auth.uid()', '(select auth.uid())'),
          'auth.jwt()', '(select auth.jwt())'
        )
      ELSE NULL
    END as fixed_with_check,
    (qual LIKE '%auth.uid()%' OR qual LIKE '%auth.jwt()%' OR
     with_check LIKE '%auth.uid()%' OR with_check LIKE '%auth.jwt()%') as needs_fix
  FROM pg_policies
)
SELECT
  'ALTER POLICY "' || policyname || '" ON ' || schemaname || '.' || tablename ||
  CASE
    WHEN fixed_qual IS NOT NULL AND cmd IN ('SELECT', 'DELETE') THEN
      ' USING (' || fixed_qual || ')'
    WHEN fixed_qual IS NOT NULL AND cmd IN ('INSERT', 'UPDATE') THEN
      ' WITH CHECK (' || fixed_qual || ')'
    ELSE ''
  END ||
  CASE
    WHEN fixed_with_check IS NOT NULL AND cmd IN ('INSERT', 'UPDATE') THEN
      ' WITH CHECK (' || fixed_with_check || ')'
    ELSE ''
  END || ';' as fix_statement
FROM policy_fixes
WHERE needs_fix = true
ORDER BY tablename, policyname
LIMIT 20; -- Start with first 20 policies

-- 3. Check remaining issues after applying fixes
SELECT
  'Auth RLS issues remaining' as issue_type,
  count(*) as count
FROM pg_policies
WHERE (qual LIKE '%auth.uid()%' OR qual LIKE '%auth.jwt()%' OR
       with_check LIKE '%auth.uid()%' OR with_check LIKE '%auth.jwt()%')

UNION ALL

SELECT
  'Multiple permissive policies (complex fix needed)' as issue_type,
  count(*) as count
FROM (
  SELECT tablename, cmd, roles
  FROM pg_policies
  WHERE permissive = 'PERMISSIVE'
  GROUP BY tablename, cmd, roles
  HAVING count(*) > 1
) subq

UNION ALL

SELECT
  'Duplicate indexes remaining' as issue_type,
  count(*) as count
FROM (
  SELECT indexname
  FROM pg_indexes
  WHERE schemaname = 'public'
  GROUP BY indexname
  HAVING count(*) > 1
) subq;