-- Comprehensive fix for ALL duplicate policies
-- This script will find and fix all tables with multiple permissive policies

-- Helper function to check if user is admin (if not exists)
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.users 
        WHERE id = (SELECT auth.uid()) 
        AND role = 'admin'
    );
$$;

-- Function to drop all policies on a table
CREATE OR REPLACE FUNCTION drop_all_policies(table_name text)
RETURNS void AS $$
DECLARE
    policy_record RECORD;
BEGIN
    FOR policy_record IN 
        SELECT policyname 
        FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = table_name
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 
                      policy_record.policyname, table_name);
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- Find and list all tables with duplicate policies
-- =====================================================
DO $$
DECLARE
    dup_record RECORD;
BEGIN
    RAISE NOTICE 'Tables with multiple permissive policies:';
    FOR dup_record IN 
        SELECT 
            tablename,
            cmd,
            COUNT(*) as policy_count,
            STRING_AGG(policyname, ', ' ORDER BY policyname) as policy_names
        FROM pg_policies
        WHERE schemaname = 'public'
        AND permissive = 'PERMISSIVE'
        GROUP BY tablename, cmd
        HAVING COUNT(*) > 1
    LOOP
        RAISE NOTICE '  Table: %, Command: %, Count: %, Policies: %', 
                     dup_record.tablename, dup_record.cmd, 
                     dup_record.policy_count, dup_record.policy_names;
    END LOOP;
END $$;

-- =====================================================
-- Additional tables that might have duplicates
-- =====================================================

-- Check and fix user_quests if it has duplicates
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'user_quests'
        AND permissive = 'PERMISSIVE'
        GROUP BY cmd
        HAVING COUNT(*) > 1
    ) THEN
        PERFORM drop_all_policies('user_quests');
        
        -- Create consolidated policies for user_quests
        EXECUTE 'CREATE POLICY "user_quests_select" ON public.user_quests
            FOR SELECT USING (
                user_id = (SELECT auth.uid()) OR is_admin()
            )';
            
        EXECUTE 'CREATE POLICY "user_quests_insert" ON public.user_quests
            FOR INSERT WITH CHECK (
                user_id = (SELECT auth.uid()) OR is_admin()
            )';
            
        EXECUTE 'CREATE POLICY "user_quests_update" ON public.user_quests
            FOR UPDATE USING (
                user_id = (SELECT auth.uid()) OR is_admin()
            )';
            
        EXECUTE 'CREATE POLICY "user_quests_delete" ON public.user_quests
            FOR DELETE USING (
                user_id = (SELECT auth.uid()) OR is_admin()
            )';
            
        RAISE NOTICE 'Fixed policies for user_quests';
    END IF;
END $$;

-- Check and fix submissions if it has duplicates
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'submissions'
        AND permissive = 'PERMISSIVE'
        GROUP BY cmd
        HAVING COUNT(*) > 1
    ) THEN
        PERFORM drop_all_policies('submissions');
        
        -- Create consolidated policies for submissions
        EXECUTE 'CREATE POLICY "submissions_select" ON public.submissions
            FOR SELECT USING (
                user_id = (SELECT auth.uid()) OR is_admin()
            )';
            
        EXECUTE 'CREATE POLICY "submissions_insert" ON public.submissions
            FOR INSERT WITH CHECK (
                user_id = (SELECT auth.uid()) OR is_admin()
            )';
            
        EXECUTE 'CREATE POLICY "submissions_update" ON public.submissions
            FOR UPDATE USING (
                user_id = (SELECT auth.uid()) OR is_admin()
            )';
            
        EXECUTE 'CREATE POLICY "submissions_delete" ON public.submissions
            FOR DELETE USING (
                user_id = (SELECT auth.uid()) OR is_admin()
            )';
            
        RAISE NOTICE 'Fixed policies for submissions';
    END IF;
END $$;

-- Check and fix user_skill_xp if it has duplicates
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'user_skill_xp'
        AND permissive = 'PERMISSIVE'
        GROUP BY cmd
        HAVING COUNT(*) > 1
    ) THEN
        PERFORM drop_all_policies('user_skill_xp');
        
        -- Create consolidated policies for user_skill_xp
        EXECUTE 'CREATE POLICY "user_skill_xp_select" ON public.user_skill_xp
            FOR SELECT USING (
                user_id = (SELECT auth.uid()) OR is_admin()
            )';
            
        EXECUTE 'CREATE POLICY "user_skill_xp_modify" ON public.user_skill_xp
            FOR ALL USING (
                is_admin() OR
                (SELECT auth.jwt() ->> ''role'') = ''service_role''
            )';
            
        RAISE NOTICE 'Fixed policies for user_skill_xp';
    END IF;
END $$;

-- Check and fix activity_log if it has duplicates
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'activity_log'
        AND permissive = 'PERMISSIVE'
        GROUP BY cmd
        HAVING COUNT(*) > 1
    ) THEN
        PERFORM drop_all_policies('activity_log');
        
        -- Create consolidated policies for activity_log
        EXECUTE 'CREATE POLICY "activity_log_select" ON public.activity_log
            FOR SELECT USING (
                user_id = (SELECT auth.uid()) OR is_admin()
            )';
            
        EXECUTE 'CREATE POLICY "activity_log_insert" ON public.activity_log
            FOR INSERT WITH CHECK (
                user_id = (SELECT auth.uid()) OR 
                is_admin() OR
                (SELECT auth.jwt() ->> ''role'') = ''service_role''
            )';
            
        RAISE NOTICE 'Fixed policies for activity_log';
    END IF;
END $$;

-- Check and fix users table if it has duplicates
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'users'
        AND permissive = 'PERMISSIVE'
        GROUP BY cmd
        HAVING COUNT(*) > 1
    ) THEN
        PERFORM drop_all_policies('users');
        
        -- Create consolidated policies for users
        EXECUTE 'CREATE POLICY "users_select" ON public.users
            FOR SELECT USING (
                id = (SELECT auth.uid()) OR is_admin()
            )';
            
        EXECUTE 'CREATE POLICY "users_update" ON public.users
            FOR UPDATE USING (
                id = (SELECT auth.uid()) OR is_admin()
            )';
            
        EXECUTE 'CREATE POLICY "users_insert" ON public.users
            FOR INSERT WITH CHECK (
                id = (SELECT auth.uid()) OR 
                is_admin() OR
                (SELECT auth.jwt() ->> ''role'') = ''service_role''
            )';
            
        RAISE NOTICE 'Fixed policies for users';
    END IF;
END $$;

-- Check and fix learning_logs if it has duplicates
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'learning_logs'
        AND permissive = 'PERMISSIVE'
        GROUP BY cmd
        HAVING COUNT(*) > 1
    ) THEN
        PERFORM drop_all_policies('learning_logs');
        
        -- Create consolidated policies for learning_logs
        EXECUTE 'CREATE POLICY "learning_logs_select" ON public.learning_logs
            FOR SELECT USING (
                user_id = (SELECT auth.uid()) OR is_admin()
            )';
            
        EXECUTE 'CREATE POLICY "learning_logs_insert" ON public.learning_logs
            FOR INSERT WITH CHECK (
                user_id = (SELECT auth.uid()) OR is_admin()
            )';
            
        EXECUTE 'CREATE POLICY "learning_logs_update" ON public.learning_logs
            FOR UPDATE USING (
                user_id = (SELECT auth.uid()) OR is_admin()
            )';
            
        EXECUTE 'CREATE POLICY "learning_logs_delete" ON public.learning_logs
            FOR DELETE USING (
                user_id = (SELECT auth.uid()) OR is_admin()
            )';
            
        RAISE NOTICE 'Fixed policies for learning_logs';
    END IF;
END $$;

-- Check and fix quest_task_completions if it has duplicates
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'quest_task_completions'
        AND permissive = 'PERMISSIVE'
        GROUP BY cmd
        HAVING COUNT(*) > 1
    ) THEN
        PERFORM drop_all_policies('quest_task_completions');
        
        -- Create consolidated policies for quest_task_completions
        EXECUTE 'CREATE POLICY "quest_task_completions_select" ON public.quest_task_completions
            FOR SELECT USING (
                user_id = (SELECT auth.uid()) OR is_admin()
            )';
            
        EXECUTE 'CREATE POLICY "quest_task_completions_insert" ON public.quest_task_completions
            FOR INSERT WITH CHECK (
                user_id = (SELECT auth.uid()) OR is_admin()
            )';
            
        EXECUTE 'CREATE POLICY "quest_task_completions_update" ON public.quest_task_completions
            FOR UPDATE USING (
                user_id = (SELECT auth.uid()) OR is_admin()
            )';
            
        RAISE NOTICE 'Fixed policies for quest_task_completions';
    END IF;
END $$;

-- =====================================================
-- Final verification
-- =====================================================
DO $$
DECLARE
    dup_count INTEGER;
BEGIN
    SELECT COUNT(DISTINCT tablename) INTO dup_count
    FROM (
        SELECT 
            tablename,
            cmd,
            COUNT(*) as policy_count
        FROM pg_policies
        WHERE schemaname = 'public'
        AND permissive = 'PERMISSIVE'
        GROUP BY tablename, cmd
        HAVING COUNT(*) > 1
    ) t;
    
    IF dup_count = 0 THEN
        RAISE NOTICE 'SUCCESS: All duplicate policies have been fixed!';
    ELSE
        RAISE NOTICE 'WARNING: There are still % tables with duplicate policies', dup_count;
        
        -- Show remaining duplicates
        FOR dup_record IN 
            SELECT 
                tablename,
                cmd,
                COUNT(*) as policy_count,
                STRING_AGG(policyname, ', ' ORDER BY policyname) as policy_names
            FROM pg_policies
            WHERE schemaname = 'public'
            AND permissive = 'PERMISSIVE'
            GROUP BY tablename, cmd
            HAVING COUNT(*) > 1
        LOOP
            RAISE NOTICE '  Remaining - Table: %, Command: %, Count: %, Policies: %', 
                         dup_record.tablename, dup_record.cmd, 
                         dup_record.policy_count, dup_record.policy_names;
        END LOOP;
    END IF;
END $$;

-- Clean up the helper function
DROP FUNCTION IF EXISTS drop_all_policies(text);

-- Final check using the verification function
SELECT * FROM public.check_performance_fixes();