-- DIRECT RLS FIX - Run this in Supabase SQL Editor
-- This directly creates policies without any complex logic

-- Create admin check function
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.users 
        WHERE id = auth.uid() 
        AND role = 'admin'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop existing policies to start fresh (safe to run even if they don't exist)
DROP POLICY IF EXISTS "users_select_all" ON public.users;
DROP POLICY IF EXISTS "users_insert_own" ON public.users;
DROP POLICY IF EXISTS "users_update_own" ON public.users;
DROP POLICY IF EXISTS "users_admin_all" ON public.users;

DROP POLICY IF EXISTS "quests_select_active" ON public.quests;
DROP POLICY IF EXISTS "quests_admin_all" ON public.quests;

DROP POLICY IF EXISTS "user_quests_select_own" ON public.user_quests;
DROP POLICY IF EXISTS "user_quests_insert_own" ON public.user_quests;
DROP POLICY IF EXISTS "user_quests_update_own" ON public.user_quests;
DROP POLICY IF EXISTS "user_quests_admin_all" ON public.user_quests;

DROP POLICY IF EXISTS "quest_tasks_select_all" ON public.quest_tasks;
DROP POLICY IF EXISTS "quest_tasks_admin_all" ON public.quest_tasks;

DROP POLICY IF EXISTS "user_quest_tasks_select_own" ON public.user_quest_tasks;
DROP POLICY IF EXISTS "user_quest_tasks_insert_own" ON public.user_quest_tasks;
DROP POLICY IF EXISTS "user_quest_tasks_update_own" ON public.user_quest_tasks;
DROP POLICY IF EXISTS "user_quest_tasks_admin_all" ON public.user_quest_tasks;

DROP POLICY IF EXISTS "learning_logs_select_own" ON public.learning_logs;
DROP POLICY IF EXISTS "learning_logs_insert_own" ON public.learning_logs;
DROP POLICY IF EXISTS "learning_logs_update_own" ON public.learning_logs;
DROP POLICY IF EXISTS "learning_logs_delete_own" ON public.learning_logs;
DROP POLICY IF EXISTS "learning_logs_admin_all" ON public.learning_logs;

DROP POLICY IF EXISTS "diplomas_select_public" ON public.diplomas;
DROP POLICY IF EXISTS "diplomas_insert_own" ON public.diplomas;
DROP POLICY IF EXISTS "diplomas_update_own" ON public.diplomas;
DROP POLICY IF EXISTS "diplomas_admin_all" ON public.diplomas;

DROP POLICY IF EXISTS "user_skill_xp_select_all" ON public.user_skill_xp;
DROP POLICY IF EXISTS "user_skill_xp_insert_own" ON public.user_skill_xp;
DROP POLICY IF EXISTS "user_skill_xp_update_own" ON public.user_skill_xp;
DROP POLICY IF EXISTS "user_skill_xp_admin_all" ON public.user_skill_xp;

-- Now create fresh policies

-- 1. USERS TABLE
CREATE POLICY "users_select_all" ON public.users 
    FOR SELECT USING (true);

CREATE POLICY "users_insert_own" ON public.users 
    FOR INSERT WITH CHECK (id = auth.uid());

CREATE POLICY "users_update_own" ON public.users 
    FOR UPDATE USING (id = auth.uid());

CREATE POLICY "users_admin_all" ON public.users 
    FOR ALL USING (is_admin());

-- 2. QUESTS TABLE  
CREATE POLICY "quests_select_active" ON public.quests 
    FOR SELECT USING (is_active = true);

CREATE POLICY "quests_admin_all" ON public.quests 
    FOR ALL USING (is_admin());

-- 3. USER_QUESTS TABLE
CREATE POLICY "user_quests_select_own" ON public.user_quests 
    FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "user_quests_insert_own" ON public.user_quests 
    FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "user_quests_update_own" ON public.user_quests 
    FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "user_quests_admin_all" ON public.user_quests 
    FOR ALL USING (is_admin());

-- 4. QUEST_TASKS TABLE
CREATE POLICY "quest_tasks_select_all" ON public.quest_tasks 
    FOR SELECT USING (true);

CREATE POLICY "quest_tasks_admin_all" ON public.quest_tasks 
    FOR ALL USING (is_admin());

-- 5. USER_QUEST_TASKS TABLE (the actual table name for task completions)
CREATE POLICY "user_quest_tasks_select_own" ON public.user_quest_tasks 
    FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "user_quest_tasks_insert_own" ON public.user_quest_tasks 
    FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "user_quest_tasks_update_own" ON public.user_quest_tasks 
    FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "user_quest_tasks_admin_all" ON public.user_quest_tasks 
    FOR ALL USING (is_admin());

-- 6. LEARNING_LOGS TABLE
CREATE POLICY "learning_logs_select_own" ON public.learning_logs 
    FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "learning_logs_insert_own" ON public.learning_logs 
    FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "learning_logs_update_own" ON public.learning_logs 
    FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "learning_logs_delete_own" ON public.learning_logs 
    FOR DELETE USING (user_id = auth.uid());

CREATE POLICY "learning_logs_admin_all" ON public.learning_logs 
    FOR ALL USING (is_admin());

-- 7. DIPLOMAS TABLE (using is_public column)
CREATE POLICY "diplomas_select_public" ON public.diplomas 
    FOR SELECT USING (is_public = true OR user_id = auth.uid());

CREATE POLICY "diplomas_insert_own" ON public.diplomas 
    FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "diplomas_update_own" ON public.diplomas 
    FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "diplomas_admin_all" ON public.diplomas 
    FOR ALL USING (is_admin());

-- 8. USER_SKILL_XP TABLE
CREATE POLICY "user_skill_xp_select_all" ON public.user_skill_xp 
    FOR SELECT USING (true);

CREATE POLICY "user_skill_xp_insert_own" ON public.user_skill_xp 
    FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "user_skill_xp_update_own" ON public.user_skill_xp 
    FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "user_skill_xp_admin_all" ON public.user_skill_xp 
    FOR ALL USING (is_admin());

-- Other important tables that might need policies

-- QUEST_COLLABORATIONS
CREATE POLICY "quest_collaborations_select_involved" ON public.quest_collaborations 
    FOR SELECT USING (requester_id = auth.uid() OR partner_id = auth.uid());

CREATE POLICY "quest_collaborations_insert_requester" ON public.quest_collaborations 
    FOR INSERT WITH CHECK (requester_id = auth.uid());

CREATE POLICY "quest_collaborations_update_involved" ON public.quest_collaborations 
    FOR UPDATE USING (requester_id = auth.uid() OR partner_id = auth.uid());

-- ACTIVITY_LOG
CREATE POLICY "activity_log_select_own" ON public.activity_log 
    FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "activity_log_insert_system" ON public.activity_log 
    FOR INSERT WITH CHECK (true);

-- FRIENDSHIPS
CREATE POLICY "friendships_select_involved" ON public.friendships 
    FOR SELECT USING (requester_id = auth.uid() OR addressee_id = auth.uid());

CREATE POLICY "friendships_insert_requester" ON public.friendships 
    FOR INSERT WITH CHECK (requester_id = auth.uid());

CREATE POLICY "friendships_update_involved" ON public.friendships 
    FOR UPDATE USING (requester_id = auth.uid() OR addressee_id = auth.uid());

-- QUEST_RATINGS
CREATE POLICY "quest_ratings_select_all" ON public.quest_ratings 
    FOR SELECT USING (true);

CREATE POLICY "quest_ratings_insert_own" ON public.quest_ratings 
    FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "quest_ratings_update_own" ON public.quest_ratings 
    FOR UPDATE USING (user_id = auth.uid());

-- QUEST_IDEAS
CREATE POLICY "quest_ideas_select_all" ON public.quest_ideas 
    FOR SELECT USING (true);

CREATE POLICY "quest_ideas_insert_auth" ON public.quest_ideas 
    FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- USER_XP
CREATE POLICY "user_xp_select_all" ON public.user_xp 
    FOR SELECT USING (true);

CREATE POLICY "user_xp_insert_own" ON public.user_xp 
    FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "user_xp_update_own" ON public.user_xp 
    FOR UPDATE USING (user_id = auth.uid());

-- SITE_SETTINGS
CREATE POLICY "site_settings_select_all" ON public.site_settings 
    FOR SELECT USING (true);

-- Verify what we created
SELECT 
    tablename,
    COUNT(*) as policy_count
FROM pg_policies
WHERE schemaname = 'public'
GROUP BY tablename
ORDER BY tablename;