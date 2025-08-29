-- Fix remaining duplicate policies for submissions and user_achievements
-- This handles the specific tables that still have issues

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

-- =====================================================
-- Fix submissions table policies
-- =====================================================
-- Drop all existing policies on submissions
DROP POLICY IF EXISTS "Admins can manage all submissions" ON public.submissions;
DROP POLICY IF EXISTS "Educators can review submissions" ON public.submissions;
DROP POLICY IF EXISTS "Users can create own submissions" ON public.submissions;
DROP POLICY IF EXISTS "Users can view own submissions" ON public.submissions;
DROP POLICY IF EXISTS "Users can update own submissions" ON public.submissions;
DROP POLICY IF EXISTS "submissions_select" ON public.submissions;
DROP POLICY IF EXISTS "submissions_insert" ON public.submissions;
DROP POLICY IF EXISTS "submissions_update" ON public.submissions;
DROP POLICY IF EXISTS "submissions_delete" ON public.submissions;

-- Create consolidated policies for submissions
-- Note: submissions are linked via user_quest_id to user_quests table
CREATE POLICY "submissions_select" ON public.submissions
    FOR SELECT
    USING (
        is_admin() OR
        educator_id = (SELECT auth.uid()) OR
        EXISTS (
            SELECT 1 FROM public.user_quests uq
            WHERE uq.id = submissions.user_quest_id
            AND uq.user_id = (SELECT auth.uid())
        )
    );

CREATE POLICY "submissions_insert" ON public.submissions
    FOR INSERT
    WITH CHECK (
        is_admin() OR
        educator_id = (SELECT auth.uid()) OR
        EXISTS (
            SELECT 1 FROM public.user_quests uq
            WHERE uq.id = submissions.user_quest_id
            AND uq.user_id = (SELECT auth.uid())
        )
    );

CREATE POLICY "submissions_update" ON public.submissions
    FOR UPDATE
    USING (
        is_admin() OR
        educator_id = (SELECT auth.uid()) OR
        EXISTS (
            SELECT 1 FROM public.user_quests uq
            WHERE uq.id = submissions.user_quest_id
            AND uq.user_id = (SELECT auth.uid())
        )
    );

CREATE POLICY "submissions_delete" ON public.submissions
    FOR DELETE
    USING (
        is_admin() OR
        educator_id = (SELECT auth.uid())
    );

-- =====================================================
-- Fix user_achievements table policies
-- =====================================================
-- Drop all existing policies on user_achievements
DROP POLICY IF EXISTS "user_achievements_system_write" ON public.user_achievements;
DROP POLICY IF EXISTS "System can create achievements" ON public.user_achievements;
DROP POLICY IF EXISTS "Public can view achievements for public profiles" ON public.user_achievements;
DROP POLICY IF EXISTS "Users can view own achievements" ON public.user_achievements;
DROP POLICY IF EXISTS "user_achievements_user_read" ON public.user_achievements;
DROP POLICY IF EXISTS "user_achievements_select" ON public.user_achievements;
DROP POLICY IF EXISTS "user_achievements_insert" ON public.user_achievements;
DROP POLICY IF EXISTS "user_achievements_update" ON public.user_achievements;
DROP POLICY IF EXISTS "user_achievements_delete" ON public.user_achievements;

-- Create consolidated policies for user_achievements
CREATE POLICY "user_achievements_select" ON public.user_achievements
    FOR SELECT
    USING (
        user_id = (SELECT auth.uid()) OR
        is_admin() OR
        -- Allow viewing if the user's diploma is public
        EXISTS (
            SELECT 1 FROM public.diplomas d
            WHERE d.user_id = user_achievements.user_id
            AND d.is_public = true
        )
    );

CREATE POLICY "user_achievements_insert" ON public.user_achievements
    FOR INSERT
    WITH CHECK (
        is_admin() OR
        (SELECT auth.jwt() ->> 'role') = 'service_role'
    );

CREATE POLICY "user_achievements_update" ON public.user_achievements
    FOR UPDATE
    USING (
        is_admin() OR
        (SELECT auth.jwt() ->> 'role') = 'service_role'
    );

CREATE POLICY "user_achievements_delete" ON public.user_achievements
    FOR DELETE
    USING (
        is_admin() OR
        (SELECT auth.jwt() ->> 'role') = 'service_role'
    );

-- =====================================================
-- Verification
-- =====================================================
DO $$
DECLARE
    dup_count INTEGER;
    dup_record RECORD;
BEGIN
    -- Count remaining duplicates
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
        RAISE NOTICE '✓ SUCCESS: All duplicate policies have been fixed!';
    ELSE
        RAISE NOTICE '⚠ WARNING: There are still % tables with duplicate policies', dup_count;
        
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
    
    -- Show the current state of submissions and user_achievements
    RAISE NOTICE '';
    RAISE NOTICE 'Current policies for submissions:';
    FOR dup_record IN 
        SELECT policyname, cmd
        FROM pg_policies
        WHERE schemaname = 'public'
        AND tablename = 'submissions'
        ORDER BY cmd, policyname
    LOOP
        RAISE NOTICE '  - % (%)', dup_record.policyname, dup_record.cmd;
    END LOOP;
    
    RAISE NOTICE '';
    RAISE NOTICE 'Current policies for user_achievements:';
    FOR dup_record IN 
        SELECT policyname, cmd
        FROM pg_policies
        WHERE schemaname = 'public'
        AND tablename = 'user_achievements'
        ORDER BY cmd, policyname
    LOOP
        RAISE NOTICE '  - % (%)', dup_record.policyname, dup_record.cmd;
    END LOOP;
END $$;

-- Final check using the verification function
SELECT * FROM public.check_performance_fixes();