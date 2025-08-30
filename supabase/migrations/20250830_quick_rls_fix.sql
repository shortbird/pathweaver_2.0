-- QUICK FIX: Create basic RLS policies to restore database access
-- Run this immediately in Supabase SQL Editor to fix the "no data selectable" issue

-- Create admin check function if it doesn't exist
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

-- CRITICAL: Create basic policies for the most important tables

-- 1. Users table - ESSENTIAL for auth to work
CREATE POLICY "Enable read access for users" ON public.users
    FOR SELECT USING (true);
CREATE POLICY "Enable insert for users" ON public.users
    FOR INSERT WITH CHECK (id = auth.uid());
CREATE POLICY "Enable update for users" ON public.users
    FOR UPDATE USING (id = auth.uid());

-- 2. Quests table - ESSENTIAL for quest browsing
CREATE POLICY "Enable read access for quests" ON public.quests
    FOR SELECT USING (true);
CREATE POLICY "Enable all for admins on quests" ON public.quests
    FOR ALL USING (is_admin());

-- 3. User_quests table - ESSENTIAL for quest progress
CREATE POLICY "Enable all for own user_quests" ON public.user_quests
    FOR ALL USING (user_id = auth.uid());

-- 4. Quest_tasks table - ESSENTIAL for V3 quests
CREATE POLICY "Enable read access for quest_tasks" ON public.quest_tasks
    FOR SELECT USING (true);

-- 5. Quest_task_completions - ESSENTIAL for task completion
CREATE POLICY "Enable all for own task completions" ON public.quest_task_completions
    FOR ALL USING (user_id = auth.uid());

-- 6. Learning_logs - ESSENTIAL for learning logs
CREATE POLICY "Enable all for own learning_logs" ON public.learning_logs
    FOR ALL USING (user_id = auth.uid());

-- 7. Diplomas - ESSENTIAL for diploma pages
CREATE POLICY "Enable read for public diplomas" ON public.diplomas
    FOR SELECT USING (public_visibility = true OR user_id = auth.uid());
CREATE POLICY "Enable all for own diplomas" ON public.diplomas
    FOR ALL USING (user_id = auth.uid());

-- 8. User_skill_xp - ESSENTIAL for XP display
CREATE POLICY "Enable read for all user_skill_xp" ON public.user_skill_xp
    FOR SELECT USING (true);
CREATE POLICY "Enable all for own user_skill_xp" ON public.user_skill_xp
    FOR ALL USING (user_id = auth.uid());

-- Quick check to see what we fixed
SELECT 
    tablename,
    COUNT(*) as policy_count
FROM pg_policies
WHERE schemaname = 'public'
GROUP BY tablename
ORDER BY tablename;