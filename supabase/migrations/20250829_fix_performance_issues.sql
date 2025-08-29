-- Fix Performance Issues Identified in Supabase Performance Report
-- Date: 2025-08-29
-- This migration addresses auth RLS initialization issues and consolidates multiple permissive policies

-- =====================================================
-- PART 1: Fix auth RLS initialization plan issues
-- =====================================================

-- Fix user_xp table - Service role can manage all XP
DROP POLICY IF EXISTS "Service role can manage all XP" ON public.user_xp;
CREATE POLICY "Service role can manage all XP" ON public.user_xp
    FOR ALL
    USING (
        (SELECT auth.jwt() ->> 'role') = 'service_role'
    );

-- Fix user_skill_details table - Service role can manage skill details
DROP POLICY IF EXISTS "Service role can manage skill details" ON public.user_skill_details;
CREATE POLICY "Service role can manage skill details" ON public.user_skill_details
    FOR ALL
    USING (
        (SELECT auth.jwt() ->> 'role') = 'service_role'
    );

-- Fix user_achievements table - user_achievements_system_write
DROP POLICY IF EXISTS "user_achievements_system_write" ON public.user_achievements;
CREATE POLICY "user_achievements_system_write" ON public.user_achievements
    FOR ALL
    USING (
        (SELECT auth.jwt() ->> 'role') = 'service_role'
    );

-- =====================================================
-- PART 2: Consolidate multiple permissive policies
-- =====================================================

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

-- ----------------------------------------------------
-- Consolidate advisor_group_members policies
-- ----------------------------------------------------
DROP POLICY IF EXISTS "Admins can manage all memberships" ON public.advisor_group_members;
DROP POLICY IF EXISTS "Advisors can manage their group members" ON public.advisor_group_members;
DROP POLICY IF EXISTS "Students can view their group memberships" ON public.advisor_group_members;

-- Combined policy for SELECT
CREATE POLICY "advisor_group_members_select" ON public.advisor_group_members
    FOR SELECT
    USING (
        is_admin() OR
        EXISTS (
            SELECT 1 FROM public.advisor_groups ag
            WHERE ag.id = advisor_group_members.group_id
            AND ag.advisor_id = (SELECT auth.uid())
        ) OR
        student_id = (SELECT auth.uid())
    );

-- Combined policy for INSERT/UPDATE/DELETE
CREATE POLICY "advisor_group_members_modify" ON public.advisor_group_members
    FOR ALL
    USING (
        is_admin() OR
        EXISTS (
            SELECT 1 FROM public.advisor_groups ag
            WHERE ag.id = advisor_group_members.group_id
            AND ag.advisor_id = (SELECT auth.uid())
        )
    );

-- ----------------------------------------------------
-- Consolidate advisor_groups policies
-- ----------------------------------------------------
DROP POLICY IF EXISTS "Admins can manage all groups" ON public.advisor_groups;
DROP POLICY IF EXISTS "Advisors can manage their groups" ON public.advisor_groups;
DROP POLICY IF EXISTS "Students can view groups they're in" ON public.advisor_groups;

-- Combined policy for SELECT
CREATE POLICY "advisor_groups_select" ON public.advisor_groups
    FOR SELECT
    USING (
        is_admin() OR
        advisor_id = (SELECT auth.uid()) OR
        EXISTS (
            SELECT 1 FROM public.advisor_group_members agm
            WHERE agm.group_id = advisor_groups.id
            AND agm.student_id = (SELECT auth.uid())
        )
    );

-- Combined policy for INSERT/UPDATE/DELETE
CREATE POLICY "advisor_groups_modify" ON public.advisor_groups
    FOR ALL
    USING (
        is_admin() OR
        advisor_id = (SELECT auth.uid())
    );

-- ----------------------------------------------------
-- Consolidate diplomas policies
-- ----------------------------------------------------
DROP POLICY IF EXISTS "Diplomas viewable by owner or if public" ON public.diplomas;
DROP POLICY IF EXISTS "Users can view own diploma" ON public.diplomas;

-- Combined policy for SELECT
CREATE POLICY "diplomas_select" ON public.diplomas
    FOR SELECT
    USING (
        user_id = (SELECT auth.uid()) OR
        is_public = true OR
        is_admin()
    );

-- ----------------------------------------------------
-- Consolidate friendships policies
-- ----------------------------------------------------
DROP POLICY IF EXISTS "Users can create friendships" ON public.friendships;
DROP POLICY IF EXISTS "friendships_user_create" ON public.friendships;
DROP POLICY IF EXISTS "Users can view own friendships" ON public.friendships;
DROP POLICY IF EXISTS "friendships_user_access" ON public.friendships;
DROP POLICY IF EXISTS "Users can update own friendships" ON public.friendships;
DROP POLICY IF EXISTS "friendships_user_update" ON public.friendships;

-- Combined policy for SELECT
CREATE POLICY "friendships_select" ON public.friendships
    FOR SELECT
    USING (
        requester_id = (SELECT auth.uid()) OR
        addressee_id = (SELECT auth.uid()) OR
        is_admin()
    );

-- Combined policy for INSERT
CREATE POLICY "friendships_insert" ON public.friendships
    FOR INSERT
    WITH CHECK (
        requester_id = (SELECT auth.uid()) OR
        is_admin()
    );

-- Combined policy for UPDATE
CREATE POLICY "friendships_update" ON public.friendships
    FOR UPDATE
    USING (
        requester_id = (SELECT auth.uid()) OR
        addressee_id = (SELECT auth.uid()) OR
        is_admin()
    );

-- ----------------------------------------------------
-- Consolidate leaderboards policies
-- ----------------------------------------------------
DROP POLICY IF EXISTS "Admins can manage leaderboards" ON public.leaderboards;
DROP POLICY IF EXISTS "Public can view leaderboards" ON public.leaderboards;

-- Combined policy for SELECT
CREATE POLICY "leaderboards_select" ON public.leaderboards
    FOR SELECT
    USING (true); -- Public view

-- Policy for INSERT/UPDATE/DELETE (admin only)
CREATE POLICY "leaderboards_modify" ON public.leaderboards
    FOR ALL
    USING (is_admin());

-- ----------------------------------------------------
-- Consolidate learning_logs_backup policies
-- ----------------------------------------------------
DROP POLICY IF EXISTS "Admins can manage learning_logs_backup" ON public.learning_logs_backup;
DROP POLICY IF EXISTS "learning_logs_backup_admin_only" ON public.learning_logs_backup;

-- Combined admin-only policy
CREATE POLICY "learning_logs_backup_admin" ON public.learning_logs_backup
    FOR ALL
    USING (is_admin());

-- ----------------------------------------------------
-- Consolidate parent_child_relationships policies
-- ----------------------------------------------------
DROP POLICY IF EXISTS "Admins can manage all relationships" ON public.parent_child_relationships;
DROP POLICY IF EXISTS "Children can view their parent relationships" ON public.parent_child_relationships;
DROP POLICY IF EXISTS "Parents can view their relationships" ON public.parent_child_relationships;

-- Combined policy for SELECT
CREATE POLICY "parent_child_relationships_select" ON public.parent_child_relationships
    FOR SELECT
    USING (
        is_admin() OR
        child_id = (SELECT auth.uid()) OR
        parent_id = (SELECT auth.uid())
    );

-- Policy for INSERT/UPDATE/DELETE
CREATE POLICY "parent_child_relationships_modify" ON public.parent_child_relationships
    FOR ALL
    USING (
        is_admin() OR
        parent_id = (SELECT auth.uid())
    );

-- ----------------------------------------------------
-- Consolidate quest_collaborations policies
-- ----------------------------------------------------
DROP POLICY IF EXISTS "Admins can manage all collaborations" ON public.quest_collaborations;
DROP POLICY IF EXISTS "Users can create collaborations" ON public.quest_collaborations;
DROP POLICY IF EXISTS "Users can view own collaborations" ON public.quest_collaborations;
DROP POLICY IF EXISTS "Users can update own collaborations" ON public.quest_collaborations;

-- Combined policy for SELECT
CREATE POLICY "quest_collaborations_select" ON public.quest_collaborations
    FOR SELECT
    USING (
        is_admin() OR
        requester_id = (SELECT auth.uid()) OR
        partner_id = (SELECT auth.uid())
    );

-- Combined policy for INSERT
CREATE POLICY "quest_collaborations_insert" ON public.quest_collaborations
    FOR INSERT
    WITH CHECK (
        requester_id = (SELECT auth.uid()) OR
        is_admin()
    );

-- Combined policy for UPDATE
CREATE POLICY "quest_collaborations_update" ON public.quest_collaborations
    FOR UPDATE
    USING (
        is_admin() OR
        requester_id = (SELECT auth.uid()) OR
        partner_id = (SELECT auth.uid())
    );

-- ----------------------------------------------------
-- Consolidate quest_reviews policies
-- ----------------------------------------------------
DROP POLICY IF EXISTS "Users can delete own quest reviews" ON public.quest_reviews;
DROP POLICY IF EXISTS "Users can create own quest reviews" ON public.quest_reviews;
DROP POLICY IF EXISTS "Users can view all quest reviews" ON public.quest_reviews;
DROP POLICY IF EXISTS "Users can update own quest reviews" ON public.quest_reviews;
DROP POLICY IF EXISTS "quest_reviews_access" ON public.quest_reviews;
DROP POLICY IF EXISTS "quest_reviews_create_update" ON public.quest_reviews;

-- Combined policy for SELECT (public view)
CREATE POLICY "quest_reviews_select" ON public.quest_reviews
    FOR SELECT
    USING (true);

-- Combined policy for INSERT
CREATE POLICY "quest_reviews_insert" ON public.quest_reviews
    FOR INSERT
    WITH CHECK (
        reviewer_id = (SELECT auth.uid()) OR
        is_admin()
    );

-- Combined policy for UPDATE
CREATE POLICY "quest_reviews_update" ON public.quest_reviews
    FOR UPDATE
    USING (
        reviewer_id = (SELECT auth.uid()) OR
        is_admin()
    );

-- Combined policy for DELETE
CREATE POLICY "quest_reviews_delete" ON public.quest_reviews
    FOR DELETE
    USING (
        reviewer_id = (SELECT auth.uid()) OR
        is_admin()
    );

-- =====================================================
-- PART 3: Create verification function
-- =====================================================

CREATE OR REPLACE FUNCTION public.check_performance_fixes()
RETURNS TABLE (
    check_name text,
    status text,
    details text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Check 1: Verify auth RLS initialization fixes
    RETURN QUERY
    SELECT 
        'Auth RLS Initialization'::text,
        CASE 
            WHEN COUNT(*) = 0 THEN 'PASS'::text
            ELSE 'FAIL'::text
        END,
        'Tables with auth.uid() in policies: ' || COUNT(*)::text
    FROM pg_policies
    WHERE schemaname = 'public'
    AND policyname IN (
        'Service role can manage all XP',
        'Service role can manage skill details',
        'user_achievements_system_write'
    )
    AND qual LIKE '%auth.uid()%'
    AND qual NOT LIKE '%(SELECT auth.uid())%';

    -- Check 2: Verify no duplicate permissive policies
    RETURN QUERY
    WITH policy_counts AS (
        SELECT 
            tablename,
            cmd,
            COUNT(*) as policy_count
        FROM pg_policies
        WHERE schemaname = 'public'
        AND permissive = 'PERMISSIVE'
        GROUP BY tablename, cmd
        HAVING COUNT(*) > 1
    )
    SELECT
        'Multiple Permissive Policies'::text,
        CASE 
            WHEN COUNT(*) = 0 THEN 'PASS'::text
            ELSE 'FAIL'::text
        END,
        'Tables with multiple permissive policies: ' || COUNT(*)::text
    FROM policy_counts;

    -- Check 3: Verify is_admin function exists
    RETURN QUERY
    SELECT
        'is_admin Function'::text,
        CASE 
            WHEN COUNT(*) = 1 THEN 'PASS'::text
            ELSE 'FAIL'::text
        END,
        'Function exists: ' || (COUNT(*) = 1)::text
    FROM pg_proc
    WHERE proname = 'is_admin'
    AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public');

END;
$$;

-- Run verification
SELECT * FROM public.check_performance_fixes();