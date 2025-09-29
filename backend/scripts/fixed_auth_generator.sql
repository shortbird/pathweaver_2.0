-- CORRECTED Auth RLS Fix Generator
-- Run this in Supabase to get clean ALTER statements

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
    WHEN cmd IN ('SELECT', 'DELETE') AND fixed_qual IS NOT NULL THEN
      ' USING (' || fixed_qual || ')'
    WHEN cmd IN ('INSERT', 'UPDATE') AND fixed_qual IS NOT NULL THEN
      ' WITH CHECK (' || fixed_qual || ')'
    WHEN cmd IN ('INSERT', 'UPDATE') AND fixed_with_check IS NOT NULL THEN
      ' WITH CHECK (' || fixed_with_check || ')'
    ELSE ''
  END || ';' as fix_statement
FROM policy_fixes
WHERE needs_fix = true
ORDER BY tablename, policyname;