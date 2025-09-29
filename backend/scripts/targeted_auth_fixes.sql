-- TARGETED AUTH FIXES
-- These fix the actual policies that exist with auth issues
-- Run the queries below to generate the correct ALTER statements

-- Generate ALTER statements for policies that actually exist and have auth issues
WITH problematic_policies AS (
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
    qual,
    with_check
  FROM pg_policies
  WHERE (qual LIKE '%auth.uid()%' OR qual LIKE '%auth.jwt()%' OR
         with_check LIKE '%auth.uid()%' OR with_check LIKE '%auth.jwt()%')
)
SELECT
  'ALTER POLICY ' || quote_ident(policyname) || ' ON ' || schemaname || '.' || tablename ||
  CASE
    WHEN cmd IN ('SELECT', 'DELETE') AND fixed_qual IS NOT NULL THEN
      ' USING (' || fixed_qual || ')'
    WHEN cmd IN ('INSERT', 'UPDATE') AND fixed_with_check IS NOT NULL THEN
      ' WITH CHECK (' || fixed_with_check || ')'
    WHEN cmd IN ('INSERT', 'UPDATE') AND fixed_qual IS NOT NULL THEN
      ' WITH CHECK (' || fixed_qual || ')'
    ELSE ''
  END || ';' as alter_statement
FROM problematic_policies
WHERE (fixed_qual IS NOT NULL OR fixed_with_check IS NOT NULL)
ORDER BY tablename, policyname;