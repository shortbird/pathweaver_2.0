-- Create missing tables and fix RLS initialization issues
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

-- 3. Create other potentially missing tables
CREATE TABLE IF NOT EXISTS public.site_settings (
    id SERIAL PRIMARY KEY,
    key VARCHAR(255) UNIQUE NOT NULL,
    value JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.user_skill_xp (
    id SERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    pillar VARCHAR(50) NOT NULL,
    xp_amount INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, pillar)
);

CREATE TABLE IF NOT EXISTS public.diplomas (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    portfolio_slug VARCHAR(255) UNIQUE,
    public_visibility BOOLEAN DEFAULT true,
    theme VARCHAR(50) DEFAULT 'default',
    bio TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. Now enable RLS on all tables (including newly created ones)
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quest_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_quests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quest_task_completions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.diplomas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_skill_xp ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;

-- 5. Create or replace helper function for auth checks
CREATE OR REPLACE FUNCTION public.get_auth_user_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid)
$$;

-- 6. Drop existing policies to avoid conflicts
DO $$ 
BEGIN
    -- Drop policies if they exist
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
    WHEN undefined_table THEN
        NULL; -- Ignore if table doesn't exist
END $$;

-- 7. Create RLS policies for site_settings (public read)
CREATE POLICY "site_settings_public_read" ON public.site_settings
    FOR SELECT
    USING (true);

-- 8. Create RLS policies for quests (public read for active)
CREATE POLICY "quests_public_read" ON public.quests
    FOR SELECT
    USING (is_active = true OR is_active IS NULL);

-- 9. Create RLS policies for quest_tasks
CREATE POLICY "quest_tasks_public_read" ON public.quest_tasks
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.quests 
            WHERE quests.id = quest_tasks.quest_id 
            AND (quests.is_active = true OR quests.is_active IS NULL)
        )
    );

-- 10. Create RLS policies for users
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

-- 11. Create RLS policies for user_quests
CREATE POLICY "user_quests_own_read" ON public.user_quests
    FOR SELECT
    USING (user_id = auth.uid());

CREATE POLICY "user_quests_own_insert" ON public.user_quests
    FOR INSERT
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "user_quests_own_update" ON public.user_quests
    FOR UPDATE
    USING (user_id = auth.uid());

-- 12. Create RLS policies for quest_task_completions
CREATE POLICY "quest_task_completions_own_read" ON public.quest_task_completions
    FOR SELECT
    USING (user_id = auth.uid());

CREATE POLICY "quest_task_completions_own_insert" ON public.quest_task_completions
    FOR INSERT
    WITH CHECK (user_id = auth.uid());

-- 13. Create RLS policies for diplomas
CREATE POLICY "diplomas_access" ON public.diplomas
    FOR SELECT
    USING (
        user_id = auth.uid() OR 
        public_visibility = true OR
        EXISTS (
            SELECT 1 FROM public.users 
            WHERE id = auth.uid() 
            AND role = 'admin'
        )
    );

-- 14. Create RLS policies for user_skill_xp
CREATE POLICY "user_skill_xp_read" ON public.user_skill_xp
    FOR SELECT
    USING (
        user_id = auth.uid() OR
        EXISTS (
            SELECT 1 FROM public.diplomas 
            WHERE diplomas.user_id = user_skill_xp.user_id 
            AND diplomas.public_visibility = true
        )
    );

CREATE POLICY "user_skill_xp_own_write" ON public.user_skill_xp
    FOR ALL
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

-- 15. Grant necessary permissions
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

-- 16. Create test function to verify setup
CREATE OR REPLACE FUNCTION public.test_rls_and_tables()
RETURNS TABLE(
    test_name text,
    result text
) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Test tables exist
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'quest_task_completions') THEN
        RETURN QUERY SELECT 'table_quest_task_completions'::text, 'EXISTS'::text;
    ELSE
        RETURN QUERY SELECT 'table_quest_task_completions'::text, 'MISSING'::text;
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'diplomas') THEN
        RETURN QUERY SELECT 'table_diplomas'::text, 'EXISTS'::text;
    ELSE
        RETURN QUERY SELECT 'table_diplomas'::text, 'MISSING'::text;
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'user_skill_xp') THEN
        RETURN QUERY SELECT 'table_user_skill_xp'::text, 'EXISTS'::text;
    ELSE
        RETURN QUERY SELECT 'table_user_skill_xp'::text, 'MISSING'::text;
    END IF;
    
    -- Test RLS is enabled
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'quest_task_completions' AND rowsecurity = true) THEN
        RETURN QUERY SELECT 'rls_quest_task_completions'::text, 'ENABLED'::text;
    ELSE
        RETURN QUERY SELECT 'rls_quest_task_completions'::text, 'DISABLED'::text;
    END IF;
    
    -- Test basic access
    IF EXISTS (SELECT 1 FROM public.site_settings LIMIT 1) OR NOT EXISTS (SELECT 1 FROM public.site_settings LIMIT 1) THEN
        RETURN QUERY SELECT 'access_site_settings'::text, 'OK'::text;
    END IF;
    
    IF EXISTS (SELECT 1 FROM public.quests WHERE is_active = true LIMIT 1) OR NOT EXISTS (SELECT 1 FROM public.quests LIMIT 1) THEN
        RETURN QUERY SELECT 'access_active_quests'::text, 'OK'::text;
    END IF;
    
    RETURN;
END;
$$;

GRANT EXECUTE ON FUNCTION public.test_rls_and_tables() TO anon, authenticated;

-- 17. Run the test
SELECT * FROM public.test_rls_and_tables();

-- 18. Insert default site settings if empty
INSERT INTO public.site_settings (key, value) 
SELECT 'app_initialized', 'true'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM public.site_settings WHERE key = 'app_initialized');

-- Success message
DO $$
BEGIN
    RAISE NOTICE 'Migration completed successfully. Tables created and RLS policies applied.';
END $$;