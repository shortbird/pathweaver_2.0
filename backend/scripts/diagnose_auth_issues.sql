-- DIAGNOSTIC: Check what auth issues remain
-- Run this to see which specific policies still have problems

-- 1. Show policies that still have auth.uid() or auth.jwt() issues
SELECT
  tablename,
  policyname,
  cmd,
  CASE
    WHEN qual LIKE '%auth.uid()%' THEN 'USING clause has auth.uid()'
    WHEN qual LIKE '%auth.jwt()%' THEN 'USING clause has auth.jwt()'
    WHEN with_check LIKE '%auth.uid()%' THEN 'WITH CHECK clause has auth.uid()'
    WHEN with_check LIKE '%auth.jwt()%' THEN 'WITH CHECK clause has auth.jwt()'
    ELSE 'Unknown issue'
  END as issue_type,
  CASE
    WHEN qual LIKE '%auth.uid()%' OR qual LIKE '%auth.jwt()%' THEN qual
    WHEN with_check LIKE '%auth.uid()%' OR with_check LIKE '%auth.jwt()%' THEN with_check
    ELSE 'N/A'
  END as problematic_clause
FROM pg_policies
WHERE (qual LIKE '%auth.uid()%' OR qual LIKE '%auth.jwt()%' OR
       with_check LIKE '%auth.uid()%' OR with_check LIKE '%auth.jwt()%')
ORDER BY tablename, policyname
LIMIT 20;

-- 2. Count by table
SELECT
  tablename,
  count(*) as problematic_policies
FROM pg_policies
WHERE (qual LIKE '%auth.uid()%' OR qual LIKE '%auth.jwt()%' OR
       with_check LIKE '%auth.uid()%' OR with_check LIKE '%auth.jwt()%')
GROUP BY tablename
ORDER BY count(*) DESC;