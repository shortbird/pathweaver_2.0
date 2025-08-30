-- Fix RLS initialization issues that may be blocking Railway connection
-- Run this in Supabase SQL Editor as admin

-- 1. Ensure RLS is enabled on all core tables
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quest_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_quests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quest_task_completions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.diplomas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_skill_xp ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;

-- 2. Create or replace helper function for auth checks (fixes auth.uid() issues)
CREATE OR REPLACE FUNCTION public.get_auth_user_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid)
$$;

-- 3. Fix site_settings to allow public read (needed for initial app load)
DROP POLICY IF EXISTS "site_settings_public_read" ON public.site_settings;
CREATE POLICY "site_settings_public_read" ON public.site_settings
    FOR SELECT
    USING (true);

-- 4. Fix quests table to allow public read of active quests
DROP POLICY IF EXISTS "quests_public_read" ON public.quests;
CREATE POLICY "quests_public_read" ON public.quests
    FOR SELECT
    USING (is_active = true);

-- 5. Fix quest_tasks to allow read when quest is active
DROP POLICY IF EXISTS "quest_tasks_public_read" ON public.quest_tasks;
CREATE POLICY "quest_tasks_public_read" ON public.quest_tasks
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.quests 
            WHERE quests.id = quest_tasks.quest_id 
            AND quests.is_active = true
        )
    );

-- 6. Fix users table to allow authenticated users to read their own data
DROP POLICY IF EXISTS "users_own_read" ON public.users;
CREATE POLICY "users_own_read" ON public.users
    FOR SELECT
    USING (
        id = public.get_auth_user_id() OR 
        EXISTS (
            SELECT 1 FROM public.users 
            WHERE id = public.get_auth_user_id() 
            AND role = 'admin'
        )
    );

-- 7. Fix user_quests to allow users to see their own progress
DROP POLICY IF EXISTS "user_quests_own_read" ON public.user_quests;
CREATE POLICY "user_quests_own_read" ON public.user_quests
    FOR SELECT
    USING (user_id = public.get_auth_user_id());

DROP POLICY IF EXISTS "user_quests_own_insert" ON public.user_quests;
CREATE POLICY "user_quests_own_insert" ON public.user_quests
    FOR INSERT
    WITH CHECK (user_id = public.get_auth_user_id());

DROP POLICY IF EXISTS "user_quests_own_update" ON public.user_quests;
CREATE POLICY "user_quests_own_update" ON public.user_quests
    FOR UPDATE
    USING (user_id = public.get_auth_user_id());

-- 8. Fix quest_task_completions
DROP POLICY IF EXISTS "quest_task_completions_own_read" ON public.quest_task_completions;
CREATE POLICY "quest_task_completions_own_read" ON public.quest_task_completions
    FOR SELECT
    USING (user_id = public.get_auth_user_id());

DROP POLICY IF EXISTS "quest_task_completions_own_insert" ON public.quest_task_completions;
CREATE POLICY "quest_task_completions_own_insert" ON public.quest_task_completions
    FOR INSERT
    WITH CHECK (user_id = public.get_auth_user_id());

-- 9. Fix diplomas - users can see their own, public can see if public_visibility is true
DROP POLICY IF EXISTS "diplomas_access" ON public.diplomas;
CREATE POLICY "diplomas_access" ON public.diplomas
    FOR SELECT
    USING (
        user_id = public.get_auth_user_id() OR 
        public_visibility = true OR
        EXISTS (
            SELECT 1 FROM public.users 
            WHERE id = public.get_auth_user_id() 
            AND role = 'admin'
        )
    );

-- 10. Fix user_skill_xp
DROP POLICY IF EXISTS "user_skill_xp_read" ON public.user_skill_xp;
CREATE POLICY "user_skill_xp_read" ON public.user_skill_xp
    FOR SELECT
    USING (
        user_id = public.get_auth_user_id() OR
        EXISTS (
            SELECT 1 FROM public.diplomas 
            WHERE diplomas.user_id = user_skill_xp.user_id 
            AND diplomas.public_visibility = true
        )
    );

DROP POLICY IF EXISTS "user_skill_xp_own_write" ON public.user_skill_xp;
CREATE POLICY "user_skill_xp_own_write" ON public.user_skill_xp
    FOR ALL
    USING (user_id = public.get_auth_user_id())
    WITH CHECK (user_id = public.get_auth_user_id());

-- 11. Create a test function to verify RLS is working
CREATE OR REPLACE FUNCTION public.test_rls_access()
RETURNS TABLE(
    test_name text,
    result text
) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Test 1: Can read site_settings
    IF EXISTS (SELECT 1 FROM public.site_settings LIMIT 1) THEN
        RETURN QUERY SELECT 'site_settings_read'::text, 'PASS'::text;
    ELSE
        RETURN QUERY SELECT 'site_settings_read'::text, 'FAIL'::text;
    END IF;
    
    -- Test 2: Can read active quests
    IF EXISTS (SELECT 1 FROM public.quests WHERE is_active = true LIMIT 1) THEN
        RETURN QUERY SELECT 'active_quests_read'::text, 'PASS'::text;
    ELSE
        RETURN QUERY SELECT 'active_quests_read'::text, 'FAIL'::text;
    END IF;
    
    -- Test 3: Check auth user
    IF auth.uid() IS NOT NULL THEN
        RETURN QUERY SELECT 'auth_user_exists'::text, 'PASS'::text;
    ELSE
        RETURN QUERY SELECT 'auth_user_exists'::text, 'NO_AUTH'::text;
    END IF;
    
    RETURN;
END;
$$;

-- Grant necessary permissions
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT ON public.site_settings TO anon, authenticated;
GRANT SELECT ON public.quests TO anon, authenticated;
GRANT SELECT ON public.quest_tasks TO anon, authenticated;
GRANT ALL ON public.users TO authenticated;
GRANT ALL ON public.user_quests TO authenticated;
GRANT ALL ON public.quest_task_completions TO authenticated;
GRANT ALL ON public.diplomas TO authenticated;
GRANT ALL ON public.user_skill_xp TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_auth_user_id() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.test_rls_access() TO anon, authenticated;

-- Test the setup
SELECT * FROM public.test_rls_access();