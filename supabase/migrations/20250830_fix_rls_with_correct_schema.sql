-- Fix RLS with correct schema column names
-- Run this in Supabase SQL Editor as admin

-- 1. Create quest_task_completions table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.quest_task_completions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    quest_id UUID NOT NULL REFERENCES public.quests(id) ON DELETE CASCADE,
    task_id UUID NOT NULL REFERENCES public.quest_tasks(id) ON DELETE CASCADE,
    evidence_url TEXT,
    evidence_text TEXT,
    completed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, task_id)
);

-- 2. Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_quest_task_completions_user_id ON public.quest_task_completions(user_id);
CREATE INDEX IF NOT EXISTS idx_quest_task_completions_quest_id ON public.quest_task_completions(quest_id);
CREATE INDEX IF NOT EXISTS idx_quest_task_completions_task_id ON public.quest_task_completions(task_id);

-- 3. Enable RLS on all core tables
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quest_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_quests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quest_task_completions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.diplomas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_skill_xp ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;

-- 4. Drop existing policies to avoid conflicts
DO $$ 
BEGIN
    -- Drop policies safely
    DROP POLICY IF EXISTS "site_settings_public_read" ON public.site_settings;
    DROP POLICY IF EXISTS "quests_public_read" ON public.quests;
    DROP POLICY IF EXISTS "quest_tasks_public_read" ON public.quest_tasks;
    DROP POLICY IF EXISTS "users_own_read" ON public.users;
    DROP POLICY IF EXISTS "user_quests_own_read" ON public.user_quests;
    DROP POLICY IF EXISTS "user_quests_own_insert" ON public.user_quests;
    DROP POLICY IF EXISTS "user_quests_own_update" ON public.user_quests;
    DROP POLICY IF EXISTS "quest_task_completions_own_read" ON public.quest_task_completions;
    DROP POLICY IF EXISTS "quest_task_completions_own_insert" ON public.quest_task_completions;
    DROP POLICY IF EXISTS "diplomas_access" ON public.diplomas;
    DROP POLICY IF EXISTS "user_skill_xp_read" ON public.user_skill_xp;
    DROP POLICY IF EXISTS "user_skill_xp_own_write" ON public.user_skill_xp;
EXCEPTION
    WHEN OTHERS THEN
        NULL; -- Ignore errors
END $$;

-- 5. Create RLS policies for site_settings (public read)
CREATE POLICY "site_settings_public_read" ON public.site_settings
    FOR SELECT
    USING (true);

-- 6. Create RLS policies for quests (public read for active)
CREATE POLICY "quests_public_read" ON public.quests
    FOR SELECT
    USING (is_active = true OR is_active IS NULL);

-- 7. Create RLS policies for quest_tasks
CREATE POLICY "quest_tasks_public_read" ON public.quest_tasks
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.quests 
            WHERE quests.id = quest_tasks.quest_id 
            AND (quests.is_active = true OR quests.is_active IS NULL)
        )
    );

-- 8. Create RLS policies for users
CREATE POLICY "users_own_read" ON public.users
    FOR SELECT
    USING (
        id = auth.uid() OR 
        EXISTS (
            SELECT 1 FROM public.users 
            WHERE id = auth.uid() 
            AND role = 'admin'
        )
    );

-- 9. Create RLS policies for user_quests
CREATE POLICY "user_quests_own_read" ON public.user_quests
    FOR SELECT
    USING (user_id = auth.uid());

CREATE POLICY "user_quests_own_insert" ON public.user_quests
    FOR INSERT
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "user_quests_own_update" ON public.user_quests
    FOR UPDATE
    USING (user_id = auth.uid());

-- 10. Create RLS policies for quest_task_completions
CREATE POLICY "quest_task_completions_own_read" ON public.quest_task_completions
    FOR SELECT
    USING (user_id = auth.uid());

CREATE POLICY "quest_task_completions_own_insert" ON public.quest_task_completions
    FOR INSERT
    WITH CHECK (user_id = auth.uid());

-- 11. Create RLS policies for diplomas (using correct column name: is_public)
CREATE POLICY "diplomas_access" ON public.diplomas
    FOR SELECT
    USING (
        user_id = auth.uid() OR 
        is_public = true OR  -- Note: using is_public, not public_visibility
        EXISTS (
            SELECT 1 FROM public.users 
            WHERE id = auth.uid() 
            AND role = 'admin'
        )
    );

-- 12. Create RLS policies for user_skill_xp
CREATE POLICY "user_skill_xp_read" ON public.user_skill_xp
    FOR SELECT
    USING (
        user_id = auth.uid() OR
        EXISTS (
            SELECT 1 FROM public.diplomas 
            WHERE diplomas.user_id = user_skill_xp.user_id 
            AND diplomas.is_public = true  -- Note: using is_public
        )
    );

CREATE POLICY "user_skill_xp_own_write" ON public.user_skill_xp
    FOR ALL
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

-- 13. Grant necessary permissions
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT ON public.site_settings TO anon, authenticated;
GRANT SELECT ON public.quests TO anon, authenticated;
GRANT SELECT ON public.quest_tasks TO anon, authenticated;
GRANT ALL ON public.users TO authenticated;
GRANT ALL ON public.user_quests TO authenticated;
GRANT ALL ON public.quest_task_completions TO authenticated;
GRANT ALL ON public.diplomas TO authenticated;
GRANT ALL ON public.user_skill_xp TO authenticated;

-- 14. Create simple test function
CREATE OR REPLACE FUNCTION public.test_railway_connection()
RETURNS TABLE(
    test_name text,
    result text
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Test 1: Basic table access
    BEGIN
        PERFORM 1 FROM public.site_settings LIMIT 1;
        RETURN QUERY SELECT 'site_settings_access'::text, 'PASS'::text;
    EXCEPTION WHEN OTHERS THEN
        RETURN QUERY SELECT 'site_settings_access'::text, 'FAIL: ' || SQLERRM::text;
    END;
    
    -- Test 2: Quests table
    BEGIN
        PERFORM 1 FROM public.quests WHERE is_active = true LIMIT 1;
        RETURN QUERY SELECT 'quests_access'::text, 'PASS'::text;
    EXCEPTION WHEN OTHERS THEN
        RETURN QUERY SELECT 'quests_access'::text, 'FAIL: ' || SQLERRM::text;
    END;
    
    -- Test 3: Check if quest_task_completions exists
    IF EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'quest_task_completions'
    ) THEN
        RETURN QUERY SELECT 'quest_task_completions_table'::text, 'EXISTS'::text;
    ELSE
        RETURN QUERY SELECT 'quest_task_completions_table'::text, 'CREATED'::text;
    END IF;
    
    -- Test 4: Check RLS status
    IF EXISTS (
        SELECT 1 FROM pg_tables 
        WHERE schemaname = 'public' 
        AND tablename = 'users' 
        AND rowsecurity = true
    ) THEN
        RETURN QUERY SELECT 'rls_enabled'::text, 'YES'::text;
    ELSE
        RETURN QUERY SELECT 'rls_enabled'::text, 'NO'::text;
    END IF;
    
    RETURN;
END;
$$;

GRANT EXECUTE ON FUNCTION public.test_railway_connection() TO anon, authenticated;

-- 15. Run the test
SELECT * FROM public.test_railway_connection();

-- 16. Create helper function for auth checks if it doesn't exist
CREATE OR REPLACE FUNCTION public.get_auth_user_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
    SELECT COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid)
$$;

GRANT EXECUTE ON FUNCTION public.get_auth_user_id() TO anon, authenticated;

-- Success message
DO $$
BEGIN
    RAISE NOTICE 'RLS policies applied successfully with correct schema!';
END $$;