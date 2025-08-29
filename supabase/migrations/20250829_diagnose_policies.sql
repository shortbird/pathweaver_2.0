-- Diagnostic query to find tables with multiple permissive policies
-- This will help identify which tables still have issues

-- Show all policies grouped by table and command
WITH policy_details AS (
    SELECT 
        tablename,
        cmd,
        COUNT(*) as policy_count,
        STRING_AGG(policyname, ', ' ORDER BY policyname) as policy_names
    FROM pg_policies
    WHERE schemaname = 'public'
    AND permissive = 'PERMISSIVE'
    GROUP BY tablename, cmd
    ORDER BY tablename, cmd
)
SELECT * FROM policy_details
WHERE policy_count > 1;

-- Show all policies for the problematic tables
SELECT 
    tablename,
    policyname,
    cmd,
    permissive,
    roles
FROM pg_policies
WHERE schemaname = 'public'
AND tablename IN (
    SELECT tablename 
    FROM (
        SELECT 
            tablename,
            cmd,
            COUNT(*) as policy_count
        FROM pg_policies
        WHERE schemaname = 'public'
        AND permissive = 'PERMISSIVE'
        GROUP BY tablename, cmd
        HAVING COUNT(*) > 1
    ) t
)
ORDER BY tablename, cmd, policyname;