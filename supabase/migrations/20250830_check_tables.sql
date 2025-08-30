-- Diagnostic: Check what tables exist and their RLS status

-- List all public tables and their RLS status
SELECT 
    t.tablename,
    CASE 
        WHEN c.relrowsecurity THEN 'ENABLED'
        ELSE 'DISABLED'
    END as rls_status,
    COUNT(p.policyname) as policy_count
FROM pg_tables t
LEFT JOIN pg_class c ON c.relname = t.tablename 
    AND c.relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
LEFT JOIN pg_policies p ON p.schemaname = t.schemaname AND p.tablename = t.tablename
WHERE t.schemaname = 'public'
GROUP BY t.tablename, c.relrowsecurity
ORDER BY t.tablename;

-- Show which critical tables are missing
SELECT 
    'quest_task_completions' as expected_table,
    CASE 
        WHEN EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'quest_task_completions')
        THEN 'EXISTS'
        ELSE 'MISSING - Check if named differently'
    END as status
UNION ALL
SELECT 
    'task_completions',
    CASE 
        WHEN EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'task_completions')
        THEN 'EXISTS'
        ELSE 'MISSING'
    END
UNION ALL
SELECT 
    'user_quest_tasks',
    CASE 
        WHEN EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'user_quest_tasks')
        THEN 'EXISTS'
        ELSE 'MISSING'
    END
UNION ALL
SELECT 
    'quest_task_completion',
    CASE 
        WHEN EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'quest_task_completion')
        THEN 'EXISTS'
        ELSE 'MISSING'
    END;