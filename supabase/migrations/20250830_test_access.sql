-- Test SQL to verify RLS policies are working
-- Run this as an authenticated user (not as postgres/admin)

-- Test 1: Can we select from users?
SELECT COUNT(*) as user_count FROM public.users;

-- Test 2: Can we select from quests?
SELECT COUNT(*) as quest_count FROM public.quests WHERE is_active = true;

-- Test 3: Can we select from quest_tasks?
SELECT COUNT(*) as task_count FROM public.quest_tasks;

-- Test 4: Check if current user can see their own data
SELECT 
    'Current User ID' as info,
    auth.uid()::text as value
UNION ALL
SELECT 
    'Can see users table',
    CASE WHEN EXISTS (SELECT 1 FROM public.users LIMIT 1) 
         THEN 'YES' 
         ELSE 'NO' 
    END
UNION ALL
SELECT 
    'Can see quests table',
    CASE WHEN EXISTS (SELECT 1 FROM public.quests LIMIT 1) 
         THEN 'YES' 
         ELSE 'NO' 
    END
UNION ALL
SELECT 
    'Can see own user record',
    CASE WHEN EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid()) 
         THEN 'YES' 
         ELSE 'NO' 
    END;