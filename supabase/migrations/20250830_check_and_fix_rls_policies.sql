-- Check and fix RLS policies for all tables
-- Date: 2025-08-30

-- First, let's check which tables have RLS enabled but no policies
DO $$
DECLARE
    table_record RECORD;
    policy_count INTEGER;
BEGIN
    RAISE NOTICE 'Checking tables with RLS enabled but no policies...';
    
    FOR table_record IN 
        SELECT schemaname, tablename 
        FROM pg_tables 
        WHERE schemaname = 'public'
        AND tablename IN (
            SELECT tablename 
            FROM pg_tables t
            WHERE t.schemaname = 'public'
            AND EXISTS (
                SELECT 1 
                FROM pg_class c
                JOIN pg_namespace n ON n.oid = c.relnamespace
                WHERE n.nspname = t.schemaname
                AND c.relname = t.tablename
                AND c.relrowsecurity = true
            )
        )
    LOOP
        SELECT COUNT(*) INTO policy_count
        FROM pg_policies
        WHERE schemaname = table_record.schemaname
        AND tablename = table_record.tablename;
        
        IF policy_count = 0 THEN
            RAISE NOTICE 'Table %.% has RLS enabled but NO policies', 
                table_record.schemaname, table_record.tablename;
        END IF;
    END LOOP;
END $$;

-- Create helper function for admin checks if it doesn't exist
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.users 
        WHERE id = (SELECT auth.uid()) 
        AND role = 'admin'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth;

-- Now let's create comprehensive policies for tables that need them

-- 1. Users table policies
DO $$
BEGIN
    -- Check if users table has policies
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'users'
    ) THEN
        RAISE NOTICE 'Creating policies for users table...';
        
        -- Users can view their own profile
        CREATE POLICY "users_select_own" ON public.users
            FOR SELECT USING (id = (SELECT auth.uid()));
        
        -- Users can update their own profile
        CREATE POLICY "users_update_own" ON public.users
            FOR UPDATE USING (id = (SELECT auth.uid()));
        
        -- Allow new users to be inserted via auth trigger
        CREATE POLICY "users_insert_auth" ON public.users
            FOR INSERT WITH CHECK (id = (SELECT auth.uid()));
        
        -- Admins can do everything
        CREATE POLICY "users_admin_all" ON public.users
            FOR ALL USING (is_admin());
    END IF;
END $$;

-- 2. Quests table policies
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'quests'
    ) THEN
        RAISE NOTICE 'Creating policies for quests table...';
        
        -- Everyone can view active quests
        CREATE POLICY "quests_select_active" ON public.quests
            FOR SELECT USING (is_active = true);
        
        -- Admins can do everything
        CREATE POLICY "quests_admin_all" ON public.quests
            FOR ALL USING (is_admin());
    END IF;
END $$;

-- 3. User_quests table policies
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'user_quests'
    ) THEN
        RAISE NOTICE 'Creating policies for user_quests table...';
        
        -- Users can view their own quest progress
        CREATE POLICY "user_quests_select_own" ON public.user_quests
            FOR SELECT USING (user_id = (SELECT auth.uid()));
        
        -- Users can insert their own quest progress
        CREATE POLICY "user_quests_insert_own" ON public.user_quests
            FOR INSERT WITH CHECK (user_id = (SELECT auth.uid()));
        
        -- Users can update their own quest progress
        CREATE POLICY "user_quests_update_own" ON public.user_quests
            FOR UPDATE USING (user_id = (SELECT auth.uid()));
        
        -- Admins can do everything
        CREATE POLICY "user_quests_admin_all" ON public.user_quests
            FOR ALL USING (is_admin());
    END IF;
END $$;

-- 4. Quest_tasks table policies
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'quest_tasks'
    ) THEN
        RAISE NOTICE 'Creating policies for quest_tasks table...';
        
        -- Everyone can view tasks for active quests
        CREATE POLICY "quest_tasks_select_active" ON public.quest_tasks
            FOR SELECT USING (
                EXISTS (
                    SELECT 1 FROM public.quests 
                    WHERE id = quest_tasks.quest_id 
                    AND is_active = true
                )
            );
        
        -- Admins can do everything
        CREATE POLICY "quest_tasks_admin_all" ON public.quest_tasks
            FOR ALL USING (is_admin());
    END IF;
END $$;

-- 5. Quest_task_completions table policies
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'quest_task_completions'
    ) THEN
        RAISE NOTICE 'Creating policies for quest_task_completions table...';
        
        -- Users can view their own task completions
        CREATE POLICY "quest_task_completions_select_own" ON public.quest_task_completions
            FOR SELECT USING (user_id = (SELECT auth.uid()));
        
        -- Users can insert their own task completions
        CREATE POLICY "quest_task_completions_insert_own" ON public.quest_task_completions
            FOR INSERT WITH CHECK (user_id = (SELECT auth.uid()));
        
        -- Users can update their own task completions
        CREATE POLICY "quest_task_completions_update_own" ON public.quest_task_completions
            FOR UPDATE USING (user_id = (SELECT auth.uid()));
        
        -- Admins can do everything
        CREATE POLICY "quest_task_completions_admin_all" ON public.quest_task_completions
            FOR ALL USING (is_admin());
    END IF;
END $$;

-- 6. Learning_logs table policies
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'learning_logs'
    ) THEN
        RAISE NOTICE 'Creating policies for learning_logs table...';
        
        -- Users can view their own logs
        CREATE POLICY "learning_logs_select_own" ON public.learning_logs
            FOR SELECT USING (user_id = (SELECT auth.uid()));
        
        -- Users can insert their own logs
        CREATE POLICY "learning_logs_insert_own" ON public.learning_logs
            FOR INSERT WITH CHECK (user_id = (SELECT auth.uid()));
        
        -- Users can update their own logs
        CREATE POLICY "learning_logs_update_own" ON public.learning_logs
            FOR UPDATE USING (user_id = (SELECT auth.uid()));
        
        -- Users can delete their own logs
        CREATE POLICY "learning_logs_delete_own" ON public.learning_logs
            FOR DELETE USING (user_id = (SELECT auth.uid()));
        
        -- Admins can do everything
        CREATE POLICY "learning_logs_admin_all" ON public.learning_logs
            FOR ALL USING (is_admin());
    END IF;
END $$;

-- 7. Quest_collaborations table policies
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'quest_collaborations'
    ) THEN
        RAISE NOTICE 'Creating policies for quest_collaborations table...';
        
        -- Users can view collaborations they're part of
        CREATE POLICY "quest_collaborations_select_involved" ON public.quest_collaborations
            FOR SELECT USING (
                requester_id = (SELECT auth.uid()) OR 
                partner_id = (SELECT auth.uid())
            );
        
        -- Users can insert collaborations they request
        CREATE POLICY "quest_collaborations_insert_requester" ON public.quest_collaborations
            FOR INSERT WITH CHECK (requester_id = (SELECT auth.uid()));
        
        -- Users can update collaborations they're part of
        CREATE POLICY "quest_collaborations_update_involved" ON public.quest_collaborations
            FOR UPDATE USING (
                requester_id = (SELECT auth.uid()) OR 
                partner_id = (SELECT auth.uid())
            );
        
        -- Admins can do everything
        CREATE POLICY "quest_collaborations_admin_all" ON public.quest_collaborations
            FOR ALL USING (is_admin());
    END IF;
END $$;

-- 8. Diplomas table policies
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'diplomas'
    ) THEN
        RAISE NOTICE 'Creating policies for diplomas table...';
        
        -- Public diplomas can be viewed by everyone
        CREATE POLICY "diplomas_select_public" ON public.diplomas
            FOR SELECT USING (public_visibility = true);
        
        -- Users can view their own diploma regardless of visibility
        CREATE POLICY "diplomas_select_own" ON public.diplomas
            FOR SELECT USING (user_id = (SELECT auth.uid()));
        
        -- Users can insert their own diploma
        CREATE POLICY "diplomas_insert_own" ON public.diplomas
            FOR INSERT WITH CHECK (user_id = (SELECT auth.uid()));
        
        -- Users can update their own diploma
        CREATE POLICY "diplomas_update_own" ON public.diplomas
            FOR UPDATE USING (user_id = (SELECT auth.uid()));
        
        -- Admins can do everything
        CREATE POLICY "diplomas_admin_all" ON public.diplomas
            FOR ALL USING (is_admin());
    END IF;
END $$;

-- 9. User_skill_xp table policies
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'user_skill_xp'
    ) THEN
        RAISE NOTICE 'Creating policies for user_skill_xp table...';
        
        -- Everyone can view XP (for leaderboards)
        CREATE POLICY "user_skill_xp_select_all" ON public.user_skill_xp
            FOR SELECT USING (true);
        
        -- Users can insert their own XP
        CREATE POLICY "user_skill_xp_insert_own" ON public.user_skill_xp
            FOR INSERT WITH CHECK (user_id = (SELECT auth.uid()));
        
        -- Users can update their own XP
        CREATE POLICY "user_skill_xp_update_own" ON public.user_skill_xp
            FOR UPDATE USING (user_id = (SELECT auth.uid()));
        
        -- Admins can do everything
        CREATE POLICY "user_skill_xp_admin_all" ON public.user_skill_xp
            FOR ALL USING (is_admin());
    END IF;
END $$;

-- 10. Quest_ratings table policies
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'quest_ratings'
    ) THEN
        RAISE NOTICE 'Creating policies for quest_ratings table...';
        
        -- Everyone can view ratings
        CREATE POLICY "quest_ratings_select_all" ON public.quest_ratings
            FOR SELECT USING (true);
        
        -- Users can insert their own ratings
        CREATE POLICY "quest_ratings_insert_own" ON public.quest_ratings
            FOR INSERT WITH CHECK (user_id = (SELECT auth.uid()));
        
        -- Users can update their own ratings
        CREATE POLICY "quest_ratings_update_own" ON public.quest_ratings
            FOR UPDATE USING (user_id = (SELECT auth.uid()));
        
        -- Admins can do everything
        CREATE POLICY "quest_ratings_admin_all" ON public.quest_ratings
            FOR ALL USING (is_admin());
    END IF;
END $$;

-- 11. Quest_ideas table policies
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'quest_ideas'
    ) THEN
        RAISE NOTICE 'Creating policies for quest_ideas table...';
        
        -- Everyone can view quest ideas
        CREATE POLICY "quest_ideas_select_all" ON public.quest_ideas
            FOR SELECT USING (true);
        
        -- Authenticated users can submit ideas
        CREATE POLICY "quest_ideas_insert_auth" ON public.quest_ideas
            FOR INSERT WITH CHECK ((SELECT auth.uid()) IS NOT NULL);
        
        -- Users can update their own ideas
        CREATE POLICY "quest_ideas_update_own" ON public.quest_ideas
            FOR UPDATE USING (submitted_by = (SELECT auth.uid()));
        
        -- Admins can do everything
        CREATE POLICY "quest_ideas_admin_all" ON public.quest_ideas
            FOR ALL USING (is_admin());
    END IF;
END $$;

-- 12. Activity_log table policies
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'activity_log'
    ) THEN
        RAISE NOTICE 'Creating policies for activity_log table...';
        
        -- Users can view their own activity
        CREATE POLICY "activity_log_select_own" ON public.activity_log
            FOR SELECT USING (user_id = (SELECT auth.uid()));
        
        -- System can insert activity (via service role)
        CREATE POLICY "activity_log_insert_system" ON public.activity_log
            FOR INSERT WITH CHECK (true);
        
        -- Admins can view all activity
        CREATE POLICY "activity_log_admin_all" ON public.activity_log
            FOR ALL USING (is_admin());
    END IF;
END $$;

-- 13. Friendships table policies
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'friendships'
    ) THEN
        RAISE NOTICE 'Creating policies for friendships table...';
        
        -- Users can view friendships they're part of
        CREATE POLICY "friendships_select_involved" ON public.friendships
            FOR SELECT USING (
                user_id = (SELECT auth.uid()) OR 
                friend_id = (SELECT auth.uid())
            );
        
        -- Users can insert friendships they initiate
        CREATE POLICY "friendships_insert_own" ON public.friendships
            FOR INSERT WITH CHECK (user_id = (SELECT auth.uid()));
        
        -- Users can update friendships they're part of
        CREATE POLICY "friendships_update_involved" ON public.friendships
            FOR UPDATE USING (
                user_id = (SELECT auth.uid()) OR 
                friend_id = (SELECT auth.uid())
            );
        
        -- Users can delete friendships they're part of
        CREATE POLICY "friendships_delete_involved" ON public.friendships
            FOR DELETE USING (
                user_id = (SELECT auth.uid()) OR 
                friend_id = (SELECT auth.uid())
            );
        
        -- Admins can do everything
        CREATE POLICY "friendships_admin_all" ON public.friendships
            FOR ALL USING (is_admin());
    END IF;
END $$;

-- 14. Submissions table policies (if exists)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'submissions') THEN
        IF NOT EXISTS (
            SELECT 1 FROM pg_policies 
            WHERE schemaname = 'public' 
            AND tablename = 'submissions'
        ) THEN
            RAISE NOTICE 'Creating policies for submissions table...';
            
            -- Users can view their own submissions
            CREATE POLICY "submissions_select_own" ON public.submissions
                FOR SELECT USING (user_id = (SELECT auth.uid()));
            
            -- Users can insert their own submissions
            CREATE POLICY "submissions_insert_own" ON public.submissions
                FOR INSERT WITH CHECK (user_id = (SELECT auth.uid()));
            
            -- Users can update their own submissions
            CREATE POLICY "submissions_update_own" ON public.submissions
                FOR UPDATE USING (user_id = (SELECT auth.uid()));
            
            -- Admins can do everything
            CREATE POLICY "submissions_admin_all" ON public.submissions
                FOR ALL USING (is_admin());
        END IF;
    END IF;
END $$;

-- 15. Submission_evidence table policies (if exists)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'submission_evidence') THEN
        IF NOT EXISTS (
            SELECT 1 FROM pg_policies 
            WHERE schemaname = 'public' 
            AND tablename = 'submission_evidence'
        ) THEN
            RAISE NOTICE 'Creating policies for submission_evidence table...';
            
            -- Users can view evidence for their submissions
            CREATE POLICY "submission_evidence_select_own" ON public.submission_evidence
                FOR SELECT USING (
                    EXISTS (
                        SELECT 1 FROM public.submissions 
                        WHERE id = submission_evidence.submission_id 
                        AND user_id = (SELECT auth.uid())
                    )
                );
            
            -- Users can insert evidence for their submissions
            CREATE POLICY "submission_evidence_insert_own" ON public.submission_evidence
                FOR INSERT WITH CHECK (
                    EXISTS (
                        SELECT 1 FROM public.submissions 
                        WHERE id = submission_evidence.submission_id 
                        AND user_id = (SELECT auth.uid())
                    )
                );
            
            -- Admins can do everything
            CREATE POLICY "submission_evidence_admin_all" ON public.submission_evidence
                FOR ALL USING (is_admin());
        END IF;
    END IF;
END $$;

-- 16. Site_settings table policies (if exists)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'site_settings') THEN
        IF NOT EXISTS (
            SELECT 1 FROM pg_policies 
            WHERE schemaname = 'public' 
            AND tablename = 'site_settings'
        ) THEN
            RAISE NOTICE 'Creating policies for site_settings table...';
            
            -- Everyone can read site settings
            CREATE POLICY "site_settings_select_all" ON public.site_settings
                FOR SELECT USING (true);
            
            -- Only admins can modify
            CREATE POLICY "site_settings_admin_all" ON public.site_settings
                FOR ALL USING (is_admin());
        END IF;
    END IF;
END $$;

-- Final check: List all tables with RLS enabled and their policy counts
DO $$
DECLARE
    table_record RECORD;
    policy_count INTEGER;
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '=== FINAL RLS STATUS CHECK ===';
    RAISE NOTICE '';
    
    FOR table_record IN 
        SELECT schemaname, tablename 
        FROM pg_tables 
        WHERE schemaname = 'public'
        AND EXISTS (
            SELECT 1 
            FROM pg_class c
            JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = 'public'
            AND c.relname = tablename
            AND c.relrowsecurity = true
        )
        ORDER BY tablename
    LOOP
        SELECT COUNT(*) INTO policy_count
        FROM pg_policies
        WHERE schemaname = table_record.schemaname
        AND tablename = table_record.tablename;
        
        IF policy_count = 0 THEN
            RAISE NOTICE '❌ Table %.% has RLS enabled but NO policies!', 
                table_record.schemaname, table_record.tablename;
        ELSE
            RAISE NOTICE '✅ Table %.% has RLS enabled with % policies', 
                table_record.schemaname, table_record.tablename, policy_count;
        END IF;
    END LOOP;
    
    RAISE NOTICE '';
    RAISE NOTICE '=== Migration Complete ===';
END $$;