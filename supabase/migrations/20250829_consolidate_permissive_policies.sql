-- Consolidate Multiple Permissive RLS Policies
-- Having multiple permissive policies for the same role and action degrades performance
-- This migration consolidates them into single, optimized policies

-- ==========================================
-- advisor_group_members table
-- ==========================================
-- Drop all existing policies
DROP POLICY IF EXISTS "Admins can manage all memberships" ON public.advisor_group_members;
DROP POLICY IF EXISTS "Advisors can manage their group members" ON public.advisor_group_members;
DROP POLICY IF EXISTS "Students can view their group memberships" ON public.advisor_group_members;

-- Create consolidated policies
CREATE POLICY "advisor_group_members_select" ON public.advisor_group_members
    FOR SELECT
    USING (
        (SELECT auth.uid()) IN (
            SELECT student_id FROM public.advisor_group_members WHERE group_id = advisor_group_members.group_id
        )
        OR EXISTS (
            SELECT 1 FROM public.advisor_groups 
            WHERE id = advisor_group_members.group_id 
            AND advisor_id = (SELECT auth.uid())
        )
        OR EXISTS (
            SELECT 1 FROM public.users 
            WHERE id = (SELECT auth.uid()) 
            AND role = 'admin'
        )
    );

CREATE POLICY "advisor_group_members_modify" ON public.advisor_group_members
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.advisor_groups 
            WHERE id = advisor_group_members.group_id 
            AND advisor_id = (SELECT auth.uid())
        )
        OR EXISTS (
            SELECT 1 FROM public.users 
            WHERE id = (SELECT auth.uid()) 
            AND role = 'admin'
        )
    );

-- ==========================================
-- advisor_groups table
-- ==========================================
DROP POLICY IF EXISTS "Admins can manage all groups" ON public.advisor_groups;
DROP POLICY IF EXISTS "Advisors can manage their groups" ON public.advisor_groups;
DROP POLICY IF EXISTS "Students can view groups they're in" ON public.advisor_groups;

CREATE POLICY "advisor_groups_select" ON public.advisor_groups
    FOR SELECT
    USING (
        advisor_id = (SELECT auth.uid())
        OR EXISTS (
            SELECT 1 FROM public.advisor_group_members 
            WHERE group_id = advisor_groups.id 
            AND student_id = (SELECT auth.uid())
        )
        OR EXISTS (
            SELECT 1 FROM public.users 
            WHERE id = (SELECT auth.uid()) 
            AND role = 'admin'
        )
    );

CREATE POLICY "advisor_groups_modify" ON public.advisor_groups
    FOR ALL
    USING (
        advisor_id = (SELECT auth.uid())
        OR EXISTS (
            SELECT 1 FROM public.users 
            WHERE id = (SELECT auth.uid()) 
            AND role = 'admin'
        )
    );

-- ==========================================
-- diplomas table
-- ==========================================
DROP POLICY IF EXISTS "Diplomas viewable by owner or if public" ON public.diplomas;
DROP POLICY IF EXISTS "Users can view own diploma" ON public.diplomas;

CREATE POLICY "diplomas_select" ON public.diplomas
    FOR SELECT
    USING (
        user_id = (SELECT auth.uid())
        OR is_public = true
    );

CREATE POLICY "diplomas_modify" ON public.diplomas
    FOR ALL
    USING (user_id = (SELECT auth.uid()));

-- ==========================================
-- leaderboards table
-- ==========================================
DROP POLICY IF EXISTS "Admins can manage leaderboards" ON public.leaderboards;
DROP POLICY IF EXISTS "Public can view leaderboards" ON public.leaderboards;

CREATE POLICY "leaderboards_select" ON public.leaderboards
    FOR SELECT
    USING (true); -- Public read access

CREATE POLICY "leaderboards_admin_modify" ON public.leaderboards
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.users 
            WHERE id = (SELECT auth.uid()) 
            AND role = 'admin'
        )
    );

-- ==========================================
-- parent_child_relationships table
-- ==========================================
DROP POLICY IF EXISTS "Admins can manage all relationships" ON public.parent_child_relationships;
DROP POLICY IF EXISTS "Children can view their parent relationships" ON public.parent_child_relationships;
DROP POLICY IF EXISTS "Parents can view their relationships" ON public.parent_child_relationships;

CREATE POLICY "parent_child_relationships_select" ON public.parent_child_relationships
    FOR SELECT
    USING (
        parent_id = (SELECT auth.uid())
        OR child_id = (SELECT auth.uid())
        OR EXISTS (
            SELECT 1 FROM public.users 
            WHERE id = (SELECT auth.uid()) 
            AND role = 'admin'
        )
    );

CREATE POLICY "parent_child_relationships_modify" ON public.parent_child_relationships
    FOR ALL
    USING (
        parent_id = (SELECT auth.uid())
        OR EXISTS (
            SELECT 1 FROM public.users 
            WHERE id = (SELECT auth.uid()) 
            AND role = 'admin'
        )
    );

-- ==========================================
-- quest_collaborations table
-- ==========================================
DROP POLICY IF EXISTS "Admins can manage all collaborations" ON public.quest_collaborations;
DROP POLICY IF EXISTS "Users can create collaborations" ON public.quest_collaborations;
DROP POLICY IF EXISTS "Users can view own collaborations" ON public.quest_collaborations;
DROP POLICY IF EXISTS "Users can update own collaborations" ON public.quest_collaborations;

CREATE POLICY "quest_collaborations_select" ON public.quest_collaborations
    FOR SELECT
    USING (
        requester_id = (SELECT auth.uid())
        OR partner_id = (SELECT auth.uid())
        OR EXISTS (
            SELECT 1 FROM public.users 
            WHERE id = (SELECT auth.uid()) 
            AND role = 'admin'
        )
    );

CREATE POLICY "quest_collaborations_insert" ON public.quest_collaborations
    FOR INSERT
    WITH CHECK (
        requester_id = (SELECT auth.uid())
        OR EXISTS (
            SELECT 1 FROM public.users 
            WHERE id = (SELECT auth.uid()) 
            AND role = 'admin'
        )
    );

CREATE POLICY "quest_collaborations_update" ON public.quest_collaborations
    FOR UPDATE
    USING (
        requester_id = (SELECT auth.uid())
        OR partner_id = (SELECT auth.uid())
        OR EXISTS (
            SELECT 1 FROM public.users 
            WHERE id = (SELECT auth.uid()) 
            AND role = 'admin'
        )
    );

-- ==========================================
-- site_settings table
-- ==========================================
DROP POLICY IF EXISTS "Admins can manage site settings" ON public.site_settings;
DROP POLICY IF EXISTS "Public can read site settings" ON public.site_settings;

CREATE POLICY "site_settings_select" ON public.site_settings
    FOR SELECT
    USING (true); -- Public read access

CREATE POLICY "site_settings_admin_modify" ON public.site_settings
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.users 
            WHERE id = (SELECT auth.uid()) 
            AND role = 'admin'
        )
    );

-- ==========================================
-- submissions table
-- ==========================================
DROP POLICY IF EXISTS "Admins can manage all submissions" ON public.submissions;
DROP POLICY IF EXISTS "Educators can review submissions" ON public.submissions;
DROP POLICY IF EXISTS "Users can create own submissions" ON public.submissions;
DROP POLICY IF EXISTS "Users can view own submissions" ON public.submissions;
DROP POLICY IF EXISTS "Users can update own submissions" ON public.submissions;

CREATE POLICY "submissions_select" ON public.submissions
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.user_quests 
            WHERE id = submissions.user_quest_id 
            AND user_id = (SELECT auth.uid())
        )
        OR educator_id = (SELECT auth.uid())
        OR EXISTS (
            SELECT 1 FROM public.users 
            WHERE id = (SELECT auth.uid()) 
            AND role IN ('admin', 'educator')
        )
    );

CREATE POLICY "submissions_insert" ON public.submissions
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.user_quests 
            WHERE id = submissions.user_quest_id 
            AND user_id = (SELECT auth.uid())
        )
        OR EXISTS (
            SELECT 1 FROM public.users 
            WHERE id = (SELECT auth.uid()) 
            AND role = 'admin'
        )
    );

CREATE POLICY "submissions_update" ON public.submissions
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM public.user_quests 
            WHERE id = submissions.user_quest_id 
            AND user_id = (SELECT auth.uid())
        )
        OR educator_id = (SELECT auth.uid())
        OR EXISTS (
            SELECT 1 FROM public.users 
            WHERE id = (SELECT auth.uid()) 
            AND role IN ('admin', 'educator')
        )
    );

CREATE POLICY "submissions_delete" ON public.submissions
    FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM public.users 
            WHERE id = (SELECT auth.uid()) 
            AND role IN ('admin', 'educator')
        )
    );