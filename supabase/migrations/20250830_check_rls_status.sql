-- Check which tables have RLS enabled but no policies
-- Run this FIRST to see what's missing

SELECT 
    c.relname as table_name,
    c.relrowsecurity as rls_enabled,
    COUNT(p.policyname) as policy_count,
    CASE 
        WHEN c.relrowsecurity AND COUNT(p.policyname) = 0 
        THEN '❌ RLS ENABLED BUT NO POLICIES - DATA BLOCKED!'
        WHEN c.relrowsecurity AND COUNT(p.policyname) > 0 
        THEN '✅ RLS enabled with ' || COUNT(p.policyname) || ' policies'
        ELSE '⚠️  RLS not enabled'
    END as status
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
LEFT JOIN pg_policies p ON p.schemaname = n.nspname AND p.tablename = c.relname
WHERE n.nspname = 'public' 
    AND c.relkind = 'r'  -- only tables
GROUP BY c.relname, c.relrowsecurity
ORDER BY 
    CASE WHEN c.relrowsecurity AND COUNT(p.policyname) = 0 THEN 0 ELSE 1 END,  -- Show problems first
    c.relname;