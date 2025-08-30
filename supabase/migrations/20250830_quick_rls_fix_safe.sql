-- SAFE QUICK FIX: Create basic RLS policies with table existence checks
-- This version checks if tables exist before creating policies

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

-- Helper function to check if a policy exists
CREATE OR REPLACE FUNCTION policy_exists(table_name text, policy_name text)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = table_name 
        AND policyname = policy_name
    );
END;
$$ LANGUAGE plpgsql;

-- 1. Users table - ESSENTIAL for auth to work
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'users') THEN
        IF NOT policy_exists('users', 'Enable read access for users') THEN
            CREATE POLICY "Enable read access for users" ON public.users
                FOR SELECT USING (true);
        END IF;
        IF NOT policy_exists('users', 'Enable insert for users') THEN
            CREATE POLICY "Enable insert for users" ON public.users
                FOR INSERT WITH CHECK (id = auth.uid());
        END IF;
        IF NOT policy_exists('users', 'Enable update for users') THEN
            CREATE POLICY "Enable update for users" ON public.users
                FOR UPDATE USING (id = auth.uid());
        END IF;
        RAISE NOTICE '✅ Users table policies created/verified';
    END IF;
END $$;

-- 2. Quests table - ESSENTIAL for quest browsing
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'quests') THEN
        IF NOT policy_exists('quests', 'Enable read access for quests') THEN
            CREATE POLICY "Enable read access for quests" ON public.quests
                FOR SELECT USING (true);
        END IF;
        IF NOT policy_exists('quests', 'Enable all for admins on quests') THEN
            CREATE POLICY "Enable all for admins on quests" ON public.quests
                FOR ALL USING (is_admin());
        END IF;
        RAISE NOTICE '✅ Quests table policies created/verified';
    END IF;
END $$;

-- 3. User_quests table - ESSENTIAL for quest progress
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'user_quests') THEN
        IF NOT policy_exists('user_quests', 'Enable all for own user_quests') THEN
            CREATE POLICY "Enable all for own user_quests" ON public.user_quests
                FOR ALL USING (user_id = auth.uid());
        END IF;
        RAISE NOTICE '✅ User_quests table policies created/verified';
    END IF;
END $$;

-- 4. Quest_tasks table - ESSENTIAL for V3 quests
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'quest_tasks') THEN
        IF NOT policy_exists('quest_tasks', 'Enable read access for quest_tasks') THEN
            CREATE POLICY "Enable read access for quest_tasks" ON public.quest_tasks
                FOR SELECT USING (true);
        END IF;
        RAISE NOTICE '✅ Quest_tasks table policies created/verified';
    END IF;
END $$;

-- 5. Quest_task_completions - Only if table exists
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'quest_task_completions') THEN
        IF NOT policy_exists('quest_task_completions', 'Enable all for own task completions') THEN
            CREATE POLICY "Enable all for own task completions" ON public.quest_task_completions
                FOR ALL USING (user_id = auth.uid());
        END IF;
        RAISE NOTICE '✅ Quest_task_completions table policies created/verified';
    ELSE
        RAISE NOTICE '⚠️  Quest_task_completions table does not exist - skipping';
    END IF;
END $$;

-- 6. Task_completions table (alternative name) - Only if exists
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'task_completions') THEN
        IF NOT policy_exists('task_completions', 'Enable all for own task completions') THEN
            CREATE POLICY "Enable all for own task completions" ON public.task_completions
                FOR ALL USING (user_id = auth.uid());
        END IF;
        RAISE NOTICE '✅ Task_completions table policies created/verified';
    END IF;
END $$;

-- 7. Learning_logs - ESSENTIAL for learning logs
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'learning_logs') THEN
        IF NOT policy_exists('learning_logs', 'Enable all for own learning_logs') THEN
            CREATE POLICY "Enable all for own learning_logs" ON public.learning_logs
                FOR ALL USING (user_id = auth.uid());
        END IF;
        RAISE NOTICE '✅ Learning_logs table policies created/verified';
    END IF;
END $$;

-- 8. Diplomas - ESSENTIAL for diploma pages
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'diplomas') THEN
        IF NOT policy_exists('diplomas', 'Enable read for public diplomas') THEN
            CREATE POLICY "Enable read for public diplomas" ON public.diplomas
                FOR SELECT USING (public_visibility = true OR user_id = auth.uid());
        END IF;
        IF NOT policy_exists('diplomas', 'Enable all for own diplomas') THEN
            CREATE POLICY "Enable all for own diplomas" ON public.diplomas
                FOR ALL USING (user_id = auth.uid());
        END IF;
        RAISE NOTICE '✅ Diplomas table policies created/verified';
    END IF;
END $$;

-- 9. User_skill_xp - ESSENTIAL for XP display
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'user_skill_xp') THEN
        IF NOT policy_exists('user_skill_xp', 'Enable read for all user_skill_xp') THEN
            CREATE POLICY "Enable read for all user_skill_xp" ON public.user_skill_xp
                FOR SELECT USING (true);
        END IF;
        IF NOT policy_exists('user_skill_xp', 'Enable all for own user_skill_xp') THEN
            CREATE POLICY "Enable all for own user_skill_xp" ON public.user_skill_xp
                FOR ALL USING (user_id = auth.uid());
        END IF;
        RAISE NOTICE '✅ User_skill_xp table policies created/verified';
    END IF;
END $$;

-- 10. Quest_collaborations - Only if exists
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'quest_collaborations') THEN
        IF NOT policy_exists('quest_collaborations', 'Enable all for involved collaborations') THEN
            CREATE POLICY "Enable all for involved collaborations" ON public.quest_collaborations
                FOR ALL USING (requester_id = auth.uid() OR partner_id = auth.uid());
        END IF;
        RAISE NOTICE '✅ Quest_collaborations table policies created/verified';
    END IF;
END $$;

-- 11. Activity_log - Only if exists
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'activity_log') THEN
        IF NOT policy_exists('activity_log', 'Enable read for own activity') THEN
            CREATE POLICY "Enable read for own activity" ON public.activity_log
                FOR SELECT USING (user_id = auth.uid());
        END IF;
        IF NOT policy_exists('activity_log', 'Enable insert for system') THEN
            CREATE POLICY "Enable insert for system" ON public.activity_log
                FOR INSERT WITH CHECK (true);
        END IF;
        RAISE NOTICE '✅ Activity_log table policies created/verified';
    END IF;
END $$;

-- 12. Friendships - Only if exists
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'friendships') THEN
        IF NOT policy_exists('friendships', 'Enable all for involved friendships') THEN
            CREATE POLICY "Enable all for involved friendships" ON public.friendships
                FOR ALL USING (user_id = auth.uid() OR friend_id = auth.uid());
        END IF;
        RAISE NOTICE '✅ Friendships table policies created/verified';
    END IF;
END $$;

-- Clean up helper function
DROP FUNCTION IF EXISTS policy_exists(text, text);

-- Final report: Show tables with RLS enabled and their policy counts
DO $$
DECLARE
    table_record RECORD;
    policy_count INTEGER;
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '=== RLS Policy Status Report ===';
    RAISE NOTICE '';
    
    FOR table_record IN 
        SELECT t.tablename 
        FROM pg_tables t
        WHERE t.schemaname = 'public'
        AND EXISTS (
            SELECT 1 
            FROM pg_class c
            JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = 'public'
            AND c.relname = t.tablename
            AND c.relrowsecurity = true
        )
        ORDER BY t.tablename
    LOOP
        SELECT COUNT(*) INTO policy_count
        FROM pg_policies
        WHERE schemaname = 'public'
        AND tablename = table_record.tablename;
        
        IF policy_count = 0 THEN
            RAISE NOTICE '❌ %: RLS enabled but NO policies!', table_record.tablename;
        ELSE
            RAISE NOTICE '✅ %: %s policies active', table_record.tablename, policy_count;
        END IF;
    END LOOP;
    
    RAISE NOTICE '';
    RAISE NOTICE '=== Quick Fix Complete ===';
    RAISE NOTICE 'Your app should now have database access restored!';
END $$;