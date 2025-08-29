-- Fix RLS Performance Issues
-- Replace auth.uid() with (SELECT auth.uid()) for better query optimization

-- Fix user_xp table policies
DROP POLICY IF EXISTS "Service role can manage all XP" ON public.user_xp;
CREATE POLICY "Service role can manage all XP" ON public.user_xp
    FOR ALL
    USING (
        (SELECT auth.jwt() ->> 'role') = 'service_role'
    );

-- Fix user_skill_details table policies  
DROP POLICY IF EXISTS "Service role can manage skill details" ON public.user_skill_details;
CREATE POLICY "Service role can manage skill details" ON public.user_skill_details
    FOR ALL
    USING (
        (SELECT auth.jwt() ->> 'role') = 'service_role'
    );

-- Fix all other tables that use auth.uid() in their policies
-- This is a template for fixing auth.uid() calls across all tables

-- Template for user-owned data policies:
-- DROP POLICY IF EXISTS "policy_name" ON public.table_name;
-- CREATE POLICY "policy_name" ON public.table_name
--     FOR SELECT/INSERT/UPDATE/DELETE
--     USING (user_id = (SELECT auth.uid()));

-- Apply this pattern to all tables with RLS policies that reference auth.uid()
-- Common tables that need this fix:

-- users table
DROP POLICY IF EXISTS "Users can view own profile" ON public.users;
CREATE POLICY "Users can view own profile" ON public.users
    FOR SELECT
    USING (id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Users can update own profile" ON public.users;
CREATE POLICY "Users can update own profile" ON public.users
    FOR UPDATE
    USING (id = (SELECT auth.uid()));

-- user_quests table
DROP POLICY IF EXISTS "Users can view own quests" ON public.user_quests;
CREATE POLICY "Users can view own quests" ON public.user_quests
    FOR SELECT
    USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Users can manage own quests" ON public.user_quests;
CREATE POLICY "Users can manage own quests" ON public.user_quests
    FOR ALL
    USING (user_id = (SELECT auth.uid()));

-- quest_task_completions table
DROP POLICY IF EXISTS "Users can view own completions" ON public.quest_task_completions;
CREATE POLICY "Users can view own completions" ON public.quest_task_completions
    FOR SELECT
    USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Users can create own completions" ON public.quest_task_completions;
CREATE POLICY "Users can create own completions" ON public.quest_task_completions
    FOR INSERT
    WITH CHECK (user_id = (SELECT auth.uid()));

-- learning_logs table
DROP POLICY IF EXISTS "Users can view own logs" ON public.learning_logs;
CREATE POLICY "Users can view own logs" ON public.learning_logs
    FOR SELECT
    USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Users can create own logs" ON public.learning_logs;
CREATE POLICY "Users can create own logs" ON public.learning_logs
    FOR INSERT
    WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Users can update own logs" ON public.learning_logs;
CREATE POLICY "Users can update own logs" ON public.learning_logs
    FOR UPDATE
    USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Users can delete own logs" ON public.learning_logs;
CREATE POLICY "Users can delete own logs" ON public.learning_logs
    FOR DELETE
    USING (user_id = (SELECT auth.uid()));

-- activity_log table
DROP POLICY IF EXISTS "Users can view own activity" ON public.activity_log;
CREATE POLICY "Users can view own activity" ON public.activity_log
    FOR SELECT
    USING (user_id = (SELECT auth.uid()));

-- user_skill_xp table
DROP POLICY IF EXISTS "Users can view own XP" ON public.user_skill_xp;
CREATE POLICY "Users can view own XP" ON public.user_skill_xp
    FOR SELECT
    USING (user_id = (SELECT auth.uid()));

-- Admin check function for better performance
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
    SELECT EXISTS (
        SELECT 1 
        FROM public.users 
        WHERE id = (SELECT auth.uid()) 
        AND role = 'admin'
    );
$$;

-- Update admin policies to use the function
DROP POLICY IF EXISTS "Admins can manage all data" ON public.quests;
CREATE POLICY "Admins can manage all data" ON public.quests
    FOR ALL
    USING (public.is_admin());

-- Apply similar pattern to other admin policies across all tables