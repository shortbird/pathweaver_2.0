-- ========================================
-- Fix Multiple Permissive Policies
-- ========================================
-- This script consolidates multiple permissive RLS policies
-- into single policies for better performance.
--
-- WARNING: This affects security! Test thoroughly!
-- ========================================

-- Summary: 31 tables with 65 action/role combinations to fix

-- ========================================
-- Table: activity_log
-- Actions to consolidate: ['INSERT', 'SELECT']
-- ========================================

-- Step 1: Review current policies for activity_log
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies 
WHERE tablename = 'activity_log'
ORDER BY cmd, policyname;

-- Step 2: Consolidate INSERT policies for activity_log
-- Current multiple policies by role:
--   Role 'anon': ['activity_log_admin_all', 'activity_log_insert_system']
--   Role 'authenticated': ['activity_log_admin_all', 'activity_log_insert_system']
--   Role 'authenticator': ['activity_log_admin_all', 'activity_log_insert_system']
--   Role 'dashboard_user': ['activity_log_admin_all', 'activity_log_insert_system']

-- Strategy: Multiple roles detected - manual review required
-- Consider creating role-specific consolidated policies
-- CREATE POLICY "activity_log_insert_anon" ON public.activity_log
--   FOR INSERT TO anon
--   USING (combined_conditions_for_anon);
-- CREATE POLICY "activity_log_insert_authenticated" ON public.activity_log
--   FOR INSERT TO authenticated
--   USING (combined_conditions_for_authenticated);
-- CREATE POLICY "activity_log_insert_authenticator" ON public.activity_log
--   FOR INSERT TO authenticator
--   USING (combined_conditions_for_authenticator);
-- CREATE POLICY "activity_log_insert_dashboard_user" ON public.activity_log
--   FOR INSERT TO dashboard_user
--   USING (combined_conditions_for_dashboard_user);

-- Step 2: Consolidate SELECT policies for activity_log
-- Current multiple policies by role:
--   Role 'anon': ['Users can view own activity', 'activity_log_admin_all', 'activity_log_select_own']
--   Role 'authenticated': ['Users can view own activity', 'activity_log_admin_all', 'activity_log_select_own']
--   Role 'authenticator': ['Users can view own activity', 'activity_log_admin_all', 'activity_log_select_own']
--   Role 'dashboard_user': ['Users can view own activity', 'activity_log_admin_all', 'activity_log_select_own']

-- Strategy: Multiple roles detected - manual review required
-- Consider creating role-specific consolidated policies
-- CREATE POLICY "activity_log_select_anon" ON public.activity_log
--   FOR SELECT TO anon
--   USING (combined_conditions_for_anon);
-- CREATE POLICY "activity_log_select_authenticated" ON public.activity_log
--   FOR SELECT TO authenticated
--   USING (combined_conditions_for_authenticated);
-- CREATE POLICY "activity_log_select_authenticator" ON public.activity_log
--   FOR SELECT TO authenticator
--   USING (combined_conditions_for_authenticator);
-- CREATE POLICY "activity_log_select_dashboard_user" ON public.activity_log
--   FOR SELECT TO dashboard_user
--   USING (combined_conditions_for_dashboard_user);


-- ========================================
-- Table: advisor_group_members
-- Actions to consolidate: ['SELECT']
-- ========================================

-- Step 1: Review current policies for advisor_group_members
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies 
WHERE tablename = 'advisor_group_members'
ORDER BY cmd, policyname;

-- Step 2: Consolidate SELECT policies for advisor_group_members
-- Current multiple policies by role:
--   Role 'anon': ['advisor_group_members_select', 'advisor_group_members_select_involved']
--   Role 'authenticated': ['advisor_group_members_select', 'advisor_group_members_select_involved']
--   Role 'authenticator': ['advisor_group_members_select', 'advisor_group_members_select_involved']
--   Role 'dashboard_user': ['advisor_group_members_select', 'advisor_group_members_select_involved']

-- Strategy: Multiple roles detected - manual review required
-- Consider creating role-specific consolidated policies
-- CREATE POLICY "advisor_group_members_select_anon" ON public.advisor_group_members
--   FOR SELECT TO anon
--   USING (combined_conditions_for_anon);
-- CREATE POLICY "advisor_group_members_select_authenticated" ON public.advisor_group_members
--   FOR SELECT TO authenticated
--   USING (combined_conditions_for_authenticated);
-- CREATE POLICY "advisor_group_members_select_authenticator" ON public.advisor_group_members
--   FOR SELECT TO authenticator
--   USING (combined_conditions_for_authenticator);
-- CREATE POLICY "advisor_group_members_select_dashboard_user" ON public.advisor_group_members
--   FOR SELECT TO dashboard_user
--   USING (combined_conditions_for_dashboard_user);


-- ========================================
-- Table: advisor_groups
-- Actions to consolidate: ['INSERT', 'SELECT', 'UPDATE']
-- ========================================

-- Step 1: Review current policies for advisor_groups
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies 
WHERE tablename = 'advisor_groups'
ORDER BY cmd, policyname;

-- Step 2: Consolidate INSERT policies for advisor_groups
-- Current multiple policies by role:
--   Role 'anon': ['advisor_groups_insert', 'advisor_groups_insert_advisor']
--   Role 'authenticated': ['advisor_groups_insert', 'advisor_groups_insert_advisor']
--   Role 'authenticator': ['advisor_groups_insert', 'advisor_groups_insert_advisor']
--   Role 'dashboard_user': ['advisor_groups_insert', 'advisor_groups_insert_advisor']

-- Strategy: Multiple roles detected - manual review required
-- Consider creating role-specific consolidated policies
-- CREATE POLICY "advisor_groups_insert_anon" ON public.advisor_groups
--   FOR INSERT TO anon
--   USING (combined_conditions_for_anon);
-- CREATE POLICY "advisor_groups_insert_authenticated" ON public.advisor_groups
--   FOR INSERT TO authenticated
--   USING (combined_conditions_for_authenticated);
-- CREATE POLICY "advisor_groups_insert_authenticator" ON public.advisor_groups
--   FOR INSERT TO authenticator
--   USING (combined_conditions_for_authenticator);
-- CREATE POLICY "advisor_groups_insert_dashboard_user" ON public.advisor_groups
--   FOR INSERT TO dashboard_user
--   USING (combined_conditions_for_dashboard_user);

-- Step 2: Consolidate SELECT policies for advisor_groups
-- Current multiple policies by role:
--   Role 'anon': ['advisor_groups_select', 'advisor_groups_select_involved']
--   Role 'authenticated': ['advisor_groups_select', 'advisor_groups_select_involved']
--   Role 'authenticator': ['advisor_groups_select', 'advisor_groups_select_involved']
--   Role 'dashboard_user': ['advisor_groups_select', 'advisor_groups_select_involved']

-- Strategy: Multiple roles detected - manual review required
-- Consider creating role-specific consolidated policies
-- CREATE POLICY "advisor_groups_select_anon" ON public.advisor_groups
--   FOR SELECT TO anon
--   USING (combined_conditions_for_anon);
-- CREATE POLICY "advisor_groups_select_authenticated" ON public.advisor_groups
--   FOR SELECT TO authenticated
--   USING (combined_conditions_for_authenticated);
-- CREATE POLICY "advisor_groups_select_authenticator" ON public.advisor_groups
--   FOR SELECT TO authenticator
--   USING (combined_conditions_for_authenticator);
-- CREATE POLICY "advisor_groups_select_dashboard_user" ON public.advisor_groups
--   FOR SELECT TO dashboard_user
--   USING (combined_conditions_for_dashboard_user);

-- Step 2: Consolidate UPDATE policies for advisor_groups
-- Current multiple policies by role:
--   Role 'anon': ['advisor_groups_update', 'advisor_groups_update_advisor']
--   Role 'authenticated': ['advisor_groups_update', 'advisor_groups_update_advisor']
--   Role 'authenticator': ['advisor_groups_update', 'advisor_groups_update_advisor']
--   Role 'dashboard_user': ['advisor_groups_update', 'advisor_groups_update_advisor']

-- Strategy: Multiple roles detected - manual review required
-- Consider creating role-specific consolidated policies
-- CREATE POLICY "advisor_groups_update_anon" ON public.advisor_groups
--   FOR UPDATE TO anon
--   USING (combined_conditions_for_anon);
-- CREATE POLICY "advisor_groups_update_authenticated" ON public.advisor_groups
--   FOR UPDATE TO authenticated
--   USING (combined_conditions_for_authenticated);
-- CREATE POLICY "advisor_groups_update_authenticator" ON public.advisor_groups
--   FOR UPDATE TO authenticator
--   USING (combined_conditions_for_authenticator);
-- CREATE POLICY "advisor_groups_update_dashboard_user" ON public.advisor_groups
--   FOR UPDATE TO dashboard_user
--   USING (combined_conditions_for_dashboard_user);


-- ========================================
-- Table: diplomas
-- Actions to consolidate: ['INSERT', 'SELECT', 'UPDATE']
-- ========================================

-- Step 1: Review current policies for diplomas
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies 
WHERE tablename = 'diplomas'
ORDER BY cmd, policyname;

-- Step 2: Consolidate INSERT policies for diplomas
-- Current multiple policies by role:
--   Role 'anon': ['Diplomas insertable by system', 'diplomas_admin_all', 'diplomas_insert_own']
--   Role 'authenticated': ['Diplomas insertable by system', 'diplomas_admin_all', 'diplomas_insert_own']
--   Role 'authenticator': ['Diplomas insertable by system', 'diplomas_admin_all', 'diplomas_insert_own']
--   Role 'dashboard_user': ['Diplomas insertable by system', 'diplomas_admin_all', 'diplomas_insert_own']

-- Strategy: Multiple roles detected - manual review required
-- Consider creating role-specific consolidated policies
-- CREATE POLICY "diplomas_insert_anon" ON public.diplomas
--   FOR INSERT TO anon
--   USING (combined_conditions_for_anon);
-- CREATE POLICY "diplomas_insert_authenticated" ON public.diplomas
--   FOR INSERT TO authenticated
--   USING (combined_conditions_for_authenticated);
-- CREATE POLICY "diplomas_insert_authenticator" ON public.diplomas
--   FOR INSERT TO authenticator
--   USING (combined_conditions_for_authenticator);
-- CREATE POLICY "diplomas_insert_dashboard_user" ON public.diplomas
--   FOR INSERT TO dashboard_user
--   USING (combined_conditions_for_dashboard_user);

-- Step 2: Consolidate SELECT policies for diplomas
-- Current multiple policies by role:
--   Role 'anon': ['diplomas_access', 'diplomas_admin_all', 'diplomas_select', 'diplomas_select_public']
--   Role 'authenticated': ['diplomas_access', 'diplomas_admin_all', 'diplomas_select', 'diplomas_select_public']
--   Role 'authenticator': ['diplomas_access', 'diplomas_admin_all', 'diplomas_select', 'diplomas_select_public']
--   Role 'dashboard_user': ['diplomas_access', 'diplomas_admin_all', 'diplomas_select', 'diplomas_select_public']

-- Strategy: Multiple roles detected - manual review required
-- Consider creating role-specific consolidated policies
-- CREATE POLICY "diplomas_select_anon" ON public.diplomas
--   FOR SELECT TO anon
--   USING (combined_conditions_for_anon);
-- CREATE POLICY "diplomas_select_authenticated" ON public.diplomas
--   FOR SELECT TO authenticated
--   USING (combined_conditions_for_authenticated);
-- CREATE POLICY "diplomas_select_authenticator" ON public.diplomas
--   FOR SELECT TO authenticator
--   USING (combined_conditions_for_authenticator);
-- CREATE POLICY "diplomas_select_dashboard_user" ON public.diplomas
--   FOR SELECT TO dashboard_user
--   USING (combined_conditions_for_dashboard_user);

-- Step 2: Consolidate UPDATE policies for diplomas
-- Current multiple policies by role:
--   Role 'anon': ['Diplomas updatable by owner', 'diplomas_admin_all', 'diplomas_update_own']
--   Role 'authenticated': ['Diplomas updatable by owner', 'diplomas_admin_all', 'diplomas_update_own']
--   Role 'authenticator': ['Diplomas updatable by owner', 'diplomas_admin_all', 'diplomas_update_own']
--   Role 'dashboard_user': ['Diplomas updatable by owner', 'diplomas_admin_all', 'diplomas_update_own']

-- Strategy: Multiple roles detected - manual review required
-- Consider creating role-specific consolidated policies
-- CREATE POLICY "diplomas_update_anon" ON public.diplomas
--   FOR UPDATE TO anon
--   USING (combined_conditions_for_anon);
-- CREATE POLICY "diplomas_update_authenticated" ON public.diplomas
--   FOR UPDATE TO authenticated
--   USING (combined_conditions_for_authenticated);
-- CREATE POLICY "diplomas_update_authenticator" ON public.diplomas
--   FOR UPDATE TO authenticator
--   USING (combined_conditions_for_authenticator);
-- CREATE POLICY "diplomas_update_dashboard_user" ON public.diplomas
--   FOR UPDATE TO dashboard_user
--   USING (combined_conditions_for_dashboard_user);


-- ========================================
-- Table: evidence_document_blocks
-- Actions to consolidate: ['SELECT']
-- ========================================

-- Step 1: Review current policies for evidence_document_blocks
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies 
WHERE tablename = 'evidence_document_blocks'
ORDER BY cmd, policyname;

-- Step 2: Consolidate SELECT policies for evidence_document_blocks
-- Current multiple policies by role:
--   Role 'anon': ['Public can view blocks from public completed documents', 'Users can view blocks from their own documents']
--   Role 'authenticated': ['Public can view blocks from public completed documents', 'Users can view blocks from their own documents']
--   Role 'authenticator': ['Public can view blocks from public completed documents', 'Users can view blocks from their own documents']
--   Role 'dashboard_user': ['Public can view blocks from public completed documents', 'Users can view blocks from their own documents']

-- Strategy: Multiple roles detected - manual review required
-- Consider creating role-specific consolidated policies
-- CREATE POLICY "evidence_document_blocks_select_anon" ON public.evidence_document_blocks
--   FOR SELECT TO anon
--   USING (combined_conditions_for_anon);
-- CREATE POLICY "evidence_document_blocks_select_authenticated" ON public.evidence_document_blocks
--   FOR SELECT TO authenticated
--   USING (combined_conditions_for_authenticated);
-- CREATE POLICY "evidence_document_blocks_select_authenticator" ON public.evidence_document_blocks
--   FOR SELECT TO authenticator
--   USING (combined_conditions_for_authenticator);
-- CREATE POLICY "evidence_document_blocks_select_dashboard_user" ON public.evidence_document_blocks
--   FOR SELECT TO dashboard_user
--   USING (combined_conditions_for_dashboard_user);


-- ========================================
-- Table: friendships
-- Actions to consolidate: ['DELETE', 'INSERT', 'SELECT', 'UPDATE']
-- ========================================

-- Step 1: Review current policies for friendships
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies 
WHERE tablename = 'friendships'
ORDER BY cmd, policyname;

-- Step 2: Consolidate DELETE policies for friendships
-- Current multiple policies by role:
--   Role 'anon': ['Users can delete own friendships', 'friendships_admin_all', 'friendships_delete_involved']
--   Role 'authenticated': ['Users can delete own friendships', 'friendships_admin_all', 'friendships_delete_involved']
--   Role 'authenticator': ['Users can delete own friendships', 'friendships_admin_all', 'friendships_delete_involved']
--   Role 'dashboard_user': ['Users can delete own friendships', 'friendships_admin_all', 'friendships_delete_involved']

-- Strategy: Multiple roles detected - manual review required
-- Consider creating role-specific consolidated policies
-- CREATE POLICY "friendships_delete_anon" ON public.friendships
--   FOR DELETE TO anon
--   USING (combined_conditions_for_anon);
-- CREATE POLICY "friendships_delete_authenticated" ON public.friendships
--   FOR DELETE TO authenticated
--   USING (combined_conditions_for_authenticated);
-- CREATE POLICY "friendships_delete_authenticator" ON public.friendships
--   FOR DELETE TO authenticator
--   USING (combined_conditions_for_authenticator);
-- CREATE POLICY "friendships_delete_dashboard_user" ON public.friendships
--   FOR DELETE TO dashboard_user
--   USING (combined_conditions_for_dashboard_user);

-- Step 2: Consolidate INSERT policies for friendships
-- Current multiple policies by role:
--   Role 'anon': ['Users can send friend requests', 'friendships_admin_all', 'friendships_insert', 'friendships_insert_requester']
--   Role 'authenticated': ['Users can send friend requests', 'friendships_admin_all', 'friendships_insert', 'friendships_insert_requester']
--   Role 'authenticator': ['Users can send friend requests', 'friendships_admin_all', 'friendships_insert', 'friendships_insert_requester']
--   Role 'dashboard_user': ['Users can send friend requests', 'friendships_admin_all', 'friendships_insert', 'friendships_insert_requester']

-- Strategy: Multiple roles detected - manual review required
-- Consider creating role-specific consolidated policies
-- CREATE POLICY "friendships_insert_anon" ON public.friendships
--   FOR INSERT TO anon
--   USING (combined_conditions_for_anon);
-- CREATE POLICY "friendships_insert_authenticated" ON public.friendships
--   FOR INSERT TO authenticated
--   USING (combined_conditions_for_authenticated);
-- CREATE POLICY "friendships_insert_authenticator" ON public.friendships
--   FOR INSERT TO authenticator
--   USING (combined_conditions_for_authenticator);
-- CREATE POLICY "friendships_insert_dashboard_user" ON public.friendships
--   FOR INSERT TO dashboard_user
--   USING (combined_conditions_for_dashboard_user);

-- Step 2: Consolidate SELECT policies for friendships
-- Current multiple policies by role:
--   Role 'anon': ['Users can view their friendships', 'friendships_admin_all', 'friendships_select', 'friendships_select_involved']
--   Role 'authenticated': ['Users can view their friendships', 'friendships_admin_all', 'friendships_select', 'friendships_select_involved']
--   Role 'authenticator': ['Users can view their friendships', 'friendships_admin_all', 'friendships_select', 'friendships_select_involved']
--   Role 'dashboard_user': ['Users can view their friendships', 'friendships_admin_all', 'friendships_select', 'friendships_select_involved']

-- Strategy: Multiple roles detected - manual review required
-- Consider creating role-specific consolidated policies
-- CREATE POLICY "friendships_select_anon" ON public.friendships
--   FOR SELECT TO anon
--   USING (combined_conditions_for_anon);
-- CREATE POLICY "friendships_select_authenticated" ON public.friendships
--   FOR SELECT TO authenticated
--   USING (combined_conditions_for_authenticated);
-- CREATE POLICY "friendships_select_authenticator" ON public.friendships
--   FOR SELECT TO authenticator
--   USING (combined_conditions_for_authenticator);
-- CREATE POLICY "friendships_select_dashboard_user" ON public.friendships
--   FOR SELECT TO dashboard_user
--   USING (combined_conditions_for_dashboard_user);

-- Step 2: Consolidate UPDATE policies for friendships
-- Current multiple policies by role:
--   Role 'anon': ["Users can update friendships they're part of", 'friendships_admin_all', 'friendships_update', 'friendships_update_involved']
--   Role 'authenticated': ["Users can update friendships they're part of", 'friendships_admin_all', 'friendships_update', 'friendships_update_involved']
--   Role 'authenticator': ["Users can update friendships they're part of", 'friendships_admin_all', 'friendships_update', 'friendships_update_involved']
--   Role 'dashboard_user': ["Users can update friendships they're part of", 'friendships_admin_all', 'friendships_update', 'friendships_update_involved']

-- Strategy: Multiple roles detected - manual review required
-- Consider creating role-specific consolidated policies
-- CREATE POLICY "friendships_update_anon" ON public.friendships
--   FOR UPDATE TO anon
--   USING (combined_conditions_for_anon);
-- CREATE POLICY "friendships_update_authenticated" ON public.friendships
--   FOR UPDATE TO authenticated
--   USING (combined_conditions_for_authenticated);
-- CREATE POLICY "friendships_update_authenticator" ON public.friendships
--   FOR UPDATE TO authenticator
--   USING (combined_conditions_for_authenticator);
-- CREATE POLICY "friendships_update_dashboard_user" ON public.friendships
--   FOR UPDATE TO dashboard_user
--   USING (combined_conditions_for_dashboard_user);


-- ========================================
-- Table: leaderboards
-- Actions to consolidate: ['DELETE', 'INSERT', 'SELECT', 'UPDATE']
-- ========================================

-- Step 1: Review current policies for leaderboards
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies 
WHERE tablename = 'leaderboards'
ORDER BY cmd, policyname;

-- Step 2: Consolidate DELETE policies for leaderboards
-- Current multiple policies by role:
--   Role 'anon': ['leaderboards_admin_all', 'leaderboards_delete']
--   Role 'authenticated': ['leaderboards_admin_all', 'leaderboards_delete']
--   Role 'authenticator': ['leaderboards_admin_all', 'leaderboards_delete']
--   Role 'dashboard_user': ['leaderboards_admin_all', 'leaderboards_delete']

-- Strategy: Multiple roles detected - manual review required
-- Consider creating role-specific consolidated policies
-- CREATE POLICY "leaderboards_delete_anon" ON public.leaderboards
--   FOR DELETE TO anon
--   USING (combined_conditions_for_anon);
-- CREATE POLICY "leaderboards_delete_authenticated" ON public.leaderboards
--   FOR DELETE TO authenticated
--   USING (combined_conditions_for_authenticated);
-- CREATE POLICY "leaderboards_delete_authenticator" ON public.leaderboards
--   FOR DELETE TO authenticator
--   USING (combined_conditions_for_authenticator);
-- CREATE POLICY "leaderboards_delete_dashboard_user" ON public.leaderboards
--   FOR DELETE TO dashboard_user
--   USING (combined_conditions_for_dashboard_user);

-- Step 2: Consolidate INSERT policies for leaderboards
-- Current multiple policies by role:
--   Role 'anon': ['leaderboards_admin_all', 'leaderboards_insert', 'leaderboards_insert_system']
--   Role 'authenticated': ['leaderboards_admin_all', 'leaderboards_insert', 'leaderboards_insert_system']
--   Role 'authenticator': ['leaderboards_admin_all', 'leaderboards_insert', 'leaderboards_insert_system']
--   Role 'dashboard_user': ['leaderboards_admin_all', 'leaderboards_insert', 'leaderboards_insert_system']

-- Strategy: Multiple roles detected - manual review required
-- Consider creating role-specific consolidated policies
-- CREATE POLICY "leaderboards_insert_anon" ON public.leaderboards
--   FOR INSERT TO anon
--   USING (combined_conditions_for_anon);
-- CREATE POLICY "leaderboards_insert_authenticated" ON public.leaderboards
--   FOR INSERT TO authenticated
--   USING (combined_conditions_for_authenticated);
-- CREATE POLICY "leaderboards_insert_authenticator" ON public.leaderboards
--   FOR INSERT TO authenticator
--   USING (combined_conditions_for_authenticator);
-- CREATE POLICY "leaderboards_insert_dashboard_user" ON public.leaderboards
--   FOR INSERT TO dashboard_user
--   USING (combined_conditions_for_dashboard_user);

-- Step 2: Consolidate SELECT policies for leaderboards
-- Current multiple policies by role:
--   Role 'anon': ['leaderboards_admin_all', 'leaderboards_select', 'leaderboards_select_all']
--   Role 'authenticated': ['leaderboards_admin_all', 'leaderboards_select', 'leaderboards_select_all']
--   Role 'authenticator': ['leaderboards_admin_all', 'leaderboards_select', 'leaderboards_select_all']
--   Role 'dashboard_user': ['leaderboards_admin_all', 'leaderboards_select', 'leaderboards_select_all']

-- Strategy: Multiple roles detected - manual review required
-- Consider creating role-specific consolidated policies
-- CREATE POLICY "leaderboards_select_anon" ON public.leaderboards
--   FOR SELECT TO anon
--   USING (combined_conditions_for_anon);
-- CREATE POLICY "leaderboards_select_authenticated" ON public.leaderboards
--   FOR SELECT TO authenticated
--   USING (combined_conditions_for_authenticated);
-- CREATE POLICY "leaderboards_select_authenticator" ON public.leaderboards
--   FOR SELECT TO authenticator
--   USING (combined_conditions_for_authenticator);
-- CREATE POLICY "leaderboards_select_dashboard_user" ON public.leaderboards
--   FOR SELECT TO dashboard_user
--   USING (combined_conditions_for_dashboard_user);

-- Step 2: Consolidate UPDATE policies for leaderboards
-- Current multiple policies by role:
--   Role 'anon': ['leaderboards_admin_all', 'leaderboards_update']
--   Role 'authenticated': ['leaderboards_admin_all', 'leaderboards_update']
--   Role 'authenticator': ['leaderboards_admin_all', 'leaderboards_update']
--   Role 'dashboard_user': ['leaderboards_admin_all', 'leaderboards_update']

-- Strategy: Multiple roles detected - manual review required
-- Consider creating role-specific consolidated policies
-- CREATE POLICY "leaderboards_update_anon" ON public.leaderboards
--   FOR UPDATE TO anon
--   USING (combined_conditions_for_anon);
-- CREATE POLICY "leaderboards_update_authenticated" ON public.leaderboards
--   FOR UPDATE TO authenticated
--   USING (combined_conditions_for_authenticated);
-- CREATE POLICY "leaderboards_update_authenticator" ON public.leaderboards
--   FOR UPDATE TO authenticator
--   USING (combined_conditions_for_authenticator);
-- CREATE POLICY "leaderboards_update_dashboard_user" ON public.leaderboards
--   FOR UPDATE TO dashboard_user
--   USING (combined_conditions_for_dashboard_user);


-- ========================================
-- Table: parent_child_relationships
-- Actions to consolidate: ['INSERT', 'SELECT', 'UPDATE']
-- ========================================

-- Step 1: Review current policies for parent_child_relationships
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies 
WHERE tablename = 'parent_child_relationships'
ORDER BY cmd, policyname;

-- Step 2: Consolidate INSERT policies for parent_child_relationships
-- Current multiple policies by role:
--   Role 'anon': ['parent_child_insert_parent', 'parent_child_relationships_insert']
--   Role 'authenticated': ['parent_child_insert_parent', 'parent_child_relationships_insert']
--   Role 'authenticator': ['parent_child_insert_parent', 'parent_child_relationships_insert']
--   Role 'dashboard_user': ['parent_child_insert_parent', 'parent_child_relationships_insert']

-- Strategy: Multiple roles detected - manual review required
-- Consider creating role-specific consolidated policies
-- CREATE POLICY "parent_child_relationships_insert_anon" ON public.parent_child_relationships
--   FOR INSERT TO anon
--   USING (combined_conditions_for_anon);
-- CREATE POLICY "parent_child_relationships_insert_authenticated" ON public.parent_child_relationships
--   FOR INSERT TO authenticated
--   USING (combined_conditions_for_authenticated);
-- CREATE POLICY "parent_child_relationships_insert_authenticator" ON public.parent_child_relationships
--   FOR INSERT TO authenticator
--   USING (combined_conditions_for_authenticator);
-- CREATE POLICY "parent_child_relationships_insert_dashboard_user" ON public.parent_child_relationships
--   FOR INSERT TO dashboard_user
--   USING (combined_conditions_for_dashboard_user);

-- Step 2: Consolidate SELECT policies for parent_child_relationships
-- Current multiple policies by role:
--   Role 'anon': ['parent_child_relationships_select', 'parent_child_select_involved']
--   Role 'authenticated': ['parent_child_relationships_select', 'parent_child_select_involved']
--   Role 'authenticator': ['parent_child_relationships_select', 'parent_child_select_involved']
--   Role 'dashboard_user': ['parent_child_relationships_select', 'parent_child_select_involved']

-- Strategy: Multiple roles detected - manual review required
-- Consider creating role-specific consolidated policies
-- CREATE POLICY "parent_child_relationships_select_anon" ON public.parent_child_relationships
--   FOR SELECT TO anon
--   USING (combined_conditions_for_anon);
-- CREATE POLICY "parent_child_relationships_select_authenticated" ON public.parent_child_relationships
--   FOR SELECT TO authenticated
--   USING (combined_conditions_for_authenticated);
-- CREATE POLICY "parent_child_relationships_select_authenticator" ON public.parent_child_relationships
--   FOR SELECT TO authenticator
--   USING (combined_conditions_for_authenticator);
-- CREATE POLICY "parent_child_relationships_select_dashboard_user" ON public.parent_child_relationships
--   FOR SELECT TO dashboard_user
--   USING (combined_conditions_for_dashboard_user);

-- Step 2: Consolidate UPDATE policies for parent_child_relationships
-- Current multiple policies by role:
--   Role 'anon': ['parent_child_relationships_update', 'parent_child_update_involved']
--   Role 'authenticated': ['parent_child_relationships_update', 'parent_child_update_involved']
--   Role 'authenticator': ['parent_child_relationships_update', 'parent_child_update_involved']
--   Role 'dashboard_user': ['parent_child_relationships_update', 'parent_child_update_involved']

-- Strategy: Multiple roles detected - manual review required
-- Consider creating role-specific consolidated policies
-- CREATE POLICY "parent_child_relationships_update_anon" ON public.parent_child_relationships
--   FOR UPDATE TO anon
--   USING (combined_conditions_for_anon);
-- CREATE POLICY "parent_child_relationships_update_authenticated" ON public.parent_child_relationships
--   FOR UPDATE TO authenticated
--   USING (combined_conditions_for_authenticated);
-- CREATE POLICY "parent_child_relationships_update_authenticator" ON public.parent_child_relationships
--   FOR UPDATE TO authenticator
--   USING (combined_conditions_for_authenticator);
-- CREATE POLICY "parent_child_relationships_update_dashboard_user" ON public.parent_child_relationships
--   FOR UPDATE TO dashboard_user
--   USING (combined_conditions_for_dashboard_user);


-- ========================================
-- Table: pillar_subcategories
-- Actions to consolidate: ['SELECT']
-- ========================================

-- Step 1: Review current policies for pillar_subcategories
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies 
WHERE tablename = 'pillar_subcategories'
ORDER BY cmd, policyname;

-- Step 2: Consolidate SELECT policies for pillar_subcategories
-- Current multiple policies by role:
--   Role 'anon': ['Only admins can manage pillar subcategories', 'Public read access to pillar subcategories']
--   Role 'authenticated': ['Only admins can manage pillar subcategories', 'Public read access to pillar subcategories']
--   Role 'authenticator': ['Only admins can manage pillar subcategories', 'Public read access to pillar subcategories']
--   Role 'dashboard_user': ['Only admins can manage pillar subcategories', 'Public read access to pillar subcategories']

-- Strategy: Multiple roles detected - manual review required
-- Consider creating role-specific consolidated policies
-- CREATE POLICY "pillar_subcategories_select_anon" ON public.pillar_subcategories
--   FOR SELECT TO anon
--   USING (combined_conditions_for_anon);
-- CREATE POLICY "pillar_subcategories_select_authenticated" ON public.pillar_subcategories
--   FOR SELECT TO authenticated
--   USING (combined_conditions_for_authenticated);
-- CREATE POLICY "pillar_subcategories_select_authenticator" ON public.pillar_subcategories
--   FOR SELECT TO authenticator
--   USING (combined_conditions_for_authenticator);
-- CREATE POLICY "pillar_subcategories_select_dashboard_user" ON public.pillar_subcategories
--   FOR SELECT TO dashboard_user
--   USING (combined_conditions_for_dashboard_user);


-- ========================================
-- Table: quest_customizations
-- Actions to consolidate: ['SELECT', 'UPDATE']
-- ========================================

-- Step 1: Review current policies for quest_customizations
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies 
WHERE tablename = 'quest_customizations'
ORDER BY cmd, policyname;

-- Step 2: Consolidate SELECT policies for quest_customizations
-- Current multiple policies by role:
--   Role 'anon': ['Admins can view all quest customizations', 'Users can view their own quest customizations']
--   Role 'authenticated': ['Admins can view all quest customizations', 'Users can view their own quest customizations']
--   Role 'authenticator': ['Admins can view all quest customizations', 'Users can view their own quest customizations']
--   Role 'dashboard_user': ['Admins can view all quest customizations', 'Users can view their own quest customizations']

-- Strategy: Multiple roles detected - manual review required
-- Consider creating role-specific consolidated policies
-- CREATE POLICY "quest_customizations_select_anon" ON public.quest_customizations
--   FOR SELECT TO anon
--   USING (combined_conditions_for_anon);
-- CREATE POLICY "quest_customizations_select_authenticated" ON public.quest_customizations
--   FOR SELECT TO authenticated
--   USING (combined_conditions_for_authenticated);
-- CREATE POLICY "quest_customizations_select_authenticator" ON public.quest_customizations
--   FOR SELECT TO authenticator
--   USING (combined_conditions_for_authenticator);
-- CREATE POLICY "quest_customizations_select_dashboard_user" ON public.quest_customizations
--   FOR SELECT TO dashboard_user
--   USING (combined_conditions_for_dashboard_user);

-- Step 2: Consolidate UPDATE policies for quest_customizations
-- Current multiple policies by role:
--   Role 'anon': ['Admins can update quest customizations', 'Users can update their own quest customizations']
--   Role 'authenticated': ['Admins can update quest customizations', 'Users can update their own quest customizations']
--   Role 'authenticator': ['Admins can update quest customizations', 'Users can update their own quest customizations']
--   Role 'dashboard_user': ['Admins can update quest customizations', 'Users can update their own quest customizations']

-- Strategy: Multiple roles detected - manual review required
-- Consider creating role-specific consolidated policies
-- CREATE POLICY "quest_customizations_update_anon" ON public.quest_customizations
--   FOR UPDATE TO anon
--   USING (combined_conditions_for_anon);
-- CREATE POLICY "quest_customizations_update_authenticated" ON public.quest_customizations
--   FOR UPDATE TO authenticated
--   USING (combined_conditions_for_authenticated);
-- CREATE POLICY "quest_customizations_update_authenticator" ON public.quest_customizations
--   FOR UPDATE TO authenticator
--   USING (combined_conditions_for_authenticator);
-- CREATE POLICY "quest_customizations_update_dashboard_user" ON public.quest_customizations
--   FOR UPDATE TO dashboard_user
--   USING (combined_conditions_for_dashboard_user);


-- ========================================
-- Table: quest_ideas
-- Actions to consolidate: ['DELETE', 'INSERT', 'SELECT', 'UPDATE']
-- ========================================

-- Step 1: Review current policies for quest_ideas
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies 
WHERE tablename = 'quest_ideas'
ORDER BY cmd, policyname;

-- Step 2: Consolidate DELETE policies for quest_ideas
-- Current multiple policies by role:
--   Role 'anon': ['Users can manage their own quest ideas', 'quest_ideas_admin_all']
--   Role 'authenticated': ['Users can manage their own quest ideas', 'quest_ideas_admin_all']
--   Role 'authenticator': ['Users can manage their own quest ideas', 'quest_ideas_admin_all']
--   Role 'dashboard_user': ['Users can manage their own quest ideas', 'quest_ideas_admin_all']

-- Strategy: Multiple roles detected - manual review required
-- Consider creating role-specific consolidated policies
-- CREATE POLICY "quest_ideas_delete_anon" ON public.quest_ideas
--   FOR DELETE TO anon
--   USING (combined_conditions_for_anon);
-- CREATE POLICY "quest_ideas_delete_authenticated" ON public.quest_ideas
--   FOR DELETE TO authenticated
--   USING (combined_conditions_for_authenticated);
-- CREATE POLICY "quest_ideas_delete_authenticator" ON public.quest_ideas
--   FOR DELETE TO authenticator
--   USING (combined_conditions_for_authenticator);
-- CREATE POLICY "quest_ideas_delete_dashboard_user" ON public.quest_ideas
--   FOR DELETE TO dashboard_user
--   USING (combined_conditions_for_dashboard_user);

-- Step 2: Consolidate INSERT policies for quest_ideas
-- Current multiple policies by role:
--   Role 'anon': ['Users can manage their own quest ideas', 'quest_ideas_admin_all', 'quest_ideas_insert_auth']
--   Role 'authenticated': ['Users can manage their own quest ideas', 'quest_ideas_admin_all', 'quest_ideas_insert_auth']
--   Role 'authenticator': ['Users can manage their own quest ideas', 'quest_ideas_admin_all', 'quest_ideas_insert_auth']
--   Role 'dashboard_user': ['Users can manage their own quest ideas', 'quest_ideas_admin_all', 'quest_ideas_insert_auth']

-- Strategy: Multiple roles detected - manual review required
-- Consider creating role-specific consolidated policies
-- CREATE POLICY "quest_ideas_insert_anon" ON public.quest_ideas
--   FOR INSERT TO anon
--   USING (combined_conditions_for_anon);
-- CREATE POLICY "quest_ideas_insert_authenticated" ON public.quest_ideas
--   FOR INSERT TO authenticated
--   USING (combined_conditions_for_authenticated);
-- CREATE POLICY "quest_ideas_insert_authenticator" ON public.quest_ideas
--   FOR INSERT TO authenticator
--   USING (combined_conditions_for_authenticator);
-- CREATE POLICY "quest_ideas_insert_dashboard_user" ON public.quest_ideas
--   FOR INSERT TO dashboard_user
--   USING (combined_conditions_for_dashboard_user);

-- Step 2: Consolidate SELECT policies for quest_ideas
-- Current multiple policies by role:
--   Role 'anon': ['Users can manage their own quest ideas', 'quest_ideas_admin_all', 'quest_ideas_select_all']
--   Role 'authenticated': ['Users can manage their own quest ideas', 'quest_ideas_admin_all', 'quest_ideas_select_all']
--   Role 'authenticator': ['Users can manage their own quest ideas', 'quest_ideas_admin_all', 'quest_ideas_select_all']
--   Role 'dashboard_user': ['Users can manage their own quest ideas', 'quest_ideas_admin_all', 'quest_ideas_select_all']

-- Strategy: Multiple roles detected - manual review required
-- Consider creating role-specific consolidated policies
-- CREATE POLICY "quest_ideas_select_anon" ON public.quest_ideas
--   FOR SELECT TO anon
--   USING (combined_conditions_for_anon);
-- CREATE POLICY "quest_ideas_select_authenticated" ON public.quest_ideas
--   FOR SELECT TO authenticated
--   USING (combined_conditions_for_authenticated);
-- CREATE POLICY "quest_ideas_select_authenticator" ON public.quest_ideas
--   FOR SELECT TO authenticator
--   USING (combined_conditions_for_authenticator);
-- CREATE POLICY "quest_ideas_select_dashboard_user" ON public.quest_ideas
--   FOR SELECT TO dashboard_user
--   USING (combined_conditions_for_dashboard_user);

-- Step 2: Consolidate UPDATE policies for quest_ideas
-- Current multiple policies by role:
--   Role 'anon': ['Users can manage their own quest ideas', 'quest_ideas_admin_all', 'quest_ideas_update_own']
--   Role 'authenticated': ['Users can manage their own quest ideas', 'quest_ideas_admin_all', 'quest_ideas_update_own']
--   Role 'authenticator': ['Users can manage their own quest ideas', 'quest_ideas_admin_all', 'quest_ideas_update_own']
--   Role 'dashboard_user': ['Users can manage their own quest ideas', 'quest_ideas_admin_all', 'quest_ideas_update_own']

-- Strategy: Multiple roles detected - manual review required
-- Consider creating role-specific consolidated policies
-- CREATE POLICY "quest_ideas_update_anon" ON public.quest_ideas
--   FOR UPDATE TO anon
--   USING (combined_conditions_for_anon);
-- CREATE POLICY "quest_ideas_update_authenticated" ON public.quest_ideas
--   FOR UPDATE TO authenticated
--   USING (combined_conditions_for_authenticated);
-- CREATE POLICY "quest_ideas_update_authenticator" ON public.quest_ideas
--   FOR UPDATE TO authenticator
--   USING (combined_conditions_for_authenticator);
-- CREATE POLICY "quest_ideas_update_dashboard_user" ON public.quest_ideas
--   FOR UPDATE TO dashboard_user
--   USING (combined_conditions_for_dashboard_user);


-- ========================================
-- Table: quest_metadata
-- Actions to consolidate: ['SELECT']
-- ========================================

-- Step 1: Review current policies for quest_metadata
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies 
WHERE tablename = 'quest_metadata'
ORDER BY cmd, policyname;

-- Step 2: Consolidate SELECT policies for quest_metadata
-- Current multiple policies by role:
--   Role 'anon': ['Only admins can manage quest metadata', 'Public read access to quest metadata']
--   Role 'authenticated': ['Only admins can manage quest metadata', 'Public read access to quest metadata']
--   Role 'authenticator': ['Only admins can manage quest metadata', 'Public read access to quest metadata']
--   Role 'dashboard_user': ['Only admins can manage quest metadata', 'Public read access to quest metadata']

-- Strategy: Multiple roles detected - manual review required
-- Consider creating role-specific consolidated policies
-- CREATE POLICY "quest_metadata_select_anon" ON public.quest_metadata
--   FOR SELECT TO anon
--   USING (combined_conditions_for_anon);
-- CREATE POLICY "quest_metadata_select_authenticated" ON public.quest_metadata
--   FOR SELECT TO authenticated
--   USING (combined_conditions_for_authenticated);
-- CREATE POLICY "quest_metadata_select_authenticator" ON public.quest_metadata
--   FOR SELECT TO authenticator
--   USING (combined_conditions_for_authenticator);
-- CREATE POLICY "quest_metadata_select_dashboard_user" ON public.quest_metadata
--   FOR SELECT TO dashboard_user
--   USING (combined_conditions_for_dashboard_user);


-- ========================================
-- Table: quest_paths
-- Actions to consolidate: ['SELECT']
-- ========================================

-- Step 1: Review current policies for quest_paths
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies 
WHERE tablename = 'quest_paths'
ORDER BY cmd, policyname;

-- Step 2: Consolidate SELECT policies for quest_paths
-- Current multiple policies by role:
--   Role 'anon': ['Only admins can manage quest paths', 'Public read access to quest paths']
--   Role 'authenticated': ['Only admins can manage quest paths', 'Public read access to quest paths']
--   Role 'authenticator': ['Only admins can manage quest paths', 'Public read access to quest paths']
--   Role 'dashboard_user': ['Only admins can manage quest paths', 'Public read access to quest paths']

-- Strategy: Multiple roles detected - manual review required
-- Consider creating role-specific consolidated policies
-- CREATE POLICY "quest_paths_select_anon" ON public.quest_paths
--   FOR SELECT TO anon
--   USING (combined_conditions_for_anon);
-- CREATE POLICY "quest_paths_select_authenticated" ON public.quest_paths
--   FOR SELECT TO authenticated
--   USING (combined_conditions_for_authenticated);
-- CREATE POLICY "quest_paths_select_authenticator" ON public.quest_paths
--   FOR SELECT TO authenticator
--   USING (combined_conditions_for_authenticator);
-- CREATE POLICY "quest_paths_select_dashboard_user" ON public.quest_paths
--   FOR SELECT TO dashboard_user
--   USING (combined_conditions_for_dashboard_user);


-- ========================================
-- Table: quest_ratings
-- Actions to consolidate: ['DELETE', 'INSERT', 'SELECT', 'UPDATE']
-- ========================================

-- Step 1: Review current policies for quest_ratings
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies 
WHERE tablename = 'quest_ratings'
ORDER BY cmd, policyname;

-- Step 2: Consolidate DELETE policies for quest_ratings
-- Current multiple policies by role:
--   Role 'anon': ['Users can manage their own quest ratings', 'quest_ratings_admin_all']
--   Role 'authenticated': ['Users can manage their own quest ratings', 'quest_ratings_admin_all']
--   Role 'authenticator': ['Users can manage their own quest ratings', 'quest_ratings_admin_all']
--   Role 'dashboard_user': ['Users can manage their own quest ratings', 'quest_ratings_admin_all']

-- Strategy: Multiple roles detected - manual review required
-- Consider creating role-specific consolidated policies
-- CREATE POLICY "quest_ratings_delete_anon" ON public.quest_ratings
--   FOR DELETE TO anon
--   USING (combined_conditions_for_anon);
-- CREATE POLICY "quest_ratings_delete_authenticated" ON public.quest_ratings
--   FOR DELETE TO authenticated
--   USING (combined_conditions_for_authenticated);
-- CREATE POLICY "quest_ratings_delete_authenticator" ON public.quest_ratings
--   FOR DELETE TO authenticator
--   USING (combined_conditions_for_authenticator);
-- CREATE POLICY "quest_ratings_delete_dashboard_user" ON public.quest_ratings
--   FOR DELETE TO dashboard_user
--   USING (combined_conditions_for_dashboard_user);

-- Step 2: Consolidate INSERT policies for quest_ratings
-- Current multiple policies by role:
--   Role 'anon': ['Users can manage their own quest ratings', 'quest_ratings_admin_all', 'quest_ratings_insert_own']
--   Role 'authenticated': ['Users can manage their own quest ratings', 'quest_ratings_admin_all', 'quest_ratings_insert_own']
--   Role 'authenticator': ['Users can manage their own quest ratings', 'quest_ratings_admin_all', 'quest_ratings_insert_own']
--   Role 'dashboard_user': ['Users can manage their own quest ratings', 'quest_ratings_admin_all', 'quest_ratings_insert_own']

-- Strategy: Multiple roles detected - manual review required
-- Consider creating role-specific consolidated policies
-- CREATE POLICY "quest_ratings_insert_anon" ON public.quest_ratings
--   FOR INSERT TO anon
--   USING (combined_conditions_for_anon);
-- CREATE POLICY "quest_ratings_insert_authenticated" ON public.quest_ratings
--   FOR INSERT TO authenticated
--   USING (combined_conditions_for_authenticated);
-- CREATE POLICY "quest_ratings_insert_authenticator" ON public.quest_ratings
--   FOR INSERT TO authenticator
--   USING (combined_conditions_for_authenticator);
-- CREATE POLICY "quest_ratings_insert_dashboard_user" ON public.quest_ratings
--   FOR INSERT TO dashboard_user
--   USING (combined_conditions_for_dashboard_user);

-- Step 2: Consolidate SELECT policies for quest_ratings
-- Current multiple policies by role:
--   Role 'anon': ['Users can manage their own quest ratings', 'quest_ratings_admin_all', 'quest_ratings_select_all']
--   Role 'authenticated': ['Users can manage their own quest ratings', 'quest_ratings_admin_all', 'quest_ratings_select_all']
--   Role 'authenticator': ['Users can manage their own quest ratings', 'quest_ratings_admin_all', 'quest_ratings_select_all']
--   Role 'dashboard_user': ['Users can manage their own quest ratings', 'quest_ratings_admin_all', 'quest_ratings_select_all']

-- Strategy: Multiple roles detected - manual review required
-- Consider creating role-specific consolidated policies
-- CREATE POLICY "quest_ratings_select_anon" ON public.quest_ratings
--   FOR SELECT TO anon
--   USING (combined_conditions_for_anon);
-- CREATE POLICY "quest_ratings_select_authenticated" ON public.quest_ratings
--   FOR SELECT TO authenticated
--   USING (combined_conditions_for_authenticated);
-- CREATE POLICY "quest_ratings_select_authenticator" ON public.quest_ratings
--   FOR SELECT TO authenticator
--   USING (combined_conditions_for_authenticator);
-- CREATE POLICY "quest_ratings_select_dashboard_user" ON public.quest_ratings
--   FOR SELECT TO dashboard_user
--   USING (combined_conditions_for_dashboard_user);

-- Step 2: Consolidate UPDATE policies for quest_ratings
-- Current multiple policies by role:
--   Role 'anon': ['Users can manage their own quest ratings', 'quest_ratings_admin_all', 'quest_ratings_update_own']
--   Role 'authenticated': ['Users can manage their own quest ratings', 'quest_ratings_admin_all', 'quest_ratings_update_own']
--   Role 'authenticator': ['Users can manage their own quest ratings', 'quest_ratings_admin_all', 'quest_ratings_update_own']
--   Role 'dashboard_user': ['Users can manage their own quest ratings', 'quest_ratings_admin_all', 'quest_ratings_update_own']

-- Strategy: Multiple roles detected - manual review required
-- Consider creating role-specific consolidated policies
-- CREATE POLICY "quest_ratings_update_anon" ON public.quest_ratings
--   FOR UPDATE TO anon
--   USING (combined_conditions_for_anon);
-- CREATE POLICY "quest_ratings_update_authenticated" ON public.quest_ratings
--   FOR UPDATE TO authenticated
--   USING (combined_conditions_for_authenticated);
-- CREATE POLICY "quest_ratings_update_authenticator" ON public.quest_ratings
--   FOR UPDATE TO authenticator
--   USING (combined_conditions_for_authenticator);
-- CREATE POLICY "quest_ratings_update_dashboard_user" ON public.quest_ratings
--   FOR UPDATE TO dashboard_user
--   USING (combined_conditions_for_dashboard_user);


-- ========================================
-- Table: quest_reviews
-- Actions to consolidate: ['INSERT', 'UPDATE']
-- ========================================

-- Step 1: Review current policies for quest_reviews
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies 
WHERE tablename = 'quest_reviews'
ORDER BY cmd, policyname;

-- Step 2: Consolidate INSERT policies for quest_reviews
-- Current multiple policies by role:
--   Role 'anon': ['quest_reviews_insert', 'quest_reviews_insert_reviewer']
--   Role 'authenticated': ['quest_reviews_insert', 'quest_reviews_insert_reviewer']
--   Role 'authenticator': ['quest_reviews_insert', 'quest_reviews_insert_reviewer']
--   Role 'dashboard_user': ['quest_reviews_insert', 'quest_reviews_insert_reviewer']

-- Strategy: Multiple roles detected - manual review required
-- Consider creating role-specific consolidated policies
-- CREATE POLICY "quest_reviews_insert_anon" ON public.quest_reviews
--   FOR INSERT TO anon
--   USING (combined_conditions_for_anon);
-- CREATE POLICY "quest_reviews_insert_authenticated" ON public.quest_reviews
--   FOR INSERT TO authenticated
--   USING (combined_conditions_for_authenticated);
-- CREATE POLICY "quest_reviews_insert_authenticator" ON public.quest_reviews
--   FOR INSERT TO authenticator
--   USING (combined_conditions_for_authenticator);
-- CREATE POLICY "quest_reviews_insert_dashboard_user" ON public.quest_reviews
--   FOR INSERT TO dashboard_user
--   USING (combined_conditions_for_dashboard_user);

-- Step 2: Consolidate UPDATE policies for quest_reviews
-- Current multiple policies by role:
--   Role 'anon': ['quest_reviews_update', 'quest_reviews_update_reviewer']
--   Role 'authenticated': ['quest_reviews_update', 'quest_reviews_update_reviewer']
--   Role 'authenticator': ['quest_reviews_update', 'quest_reviews_update_reviewer']
--   Role 'dashboard_user': ['quest_reviews_update', 'quest_reviews_update_reviewer']

-- Strategy: Multiple roles detected - manual review required
-- Consider creating role-specific consolidated policies
-- CREATE POLICY "quest_reviews_update_anon" ON public.quest_reviews
--   FOR UPDATE TO anon
--   USING (combined_conditions_for_anon);
-- CREATE POLICY "quest_reviews_update_authenticated" ON public.quest_reviews
--   FOR UPDATE TO authenticated
--   USING (combined_conditions_for_authenticated);
-- CREATE POLICY "quest_reviews_update_authenticator" ON public.quest_reviews
--   FOR UPDATE TO authenticator
--   USING (combined_conditions_for_authenticator);
-- CREATE POLICY "quest_reviews_update_dashboard_user" ON public.quest_reviews
--   FOR UPDATE TO dashboard_user
--   USING (combined_conditions_for_dashboard_user);


-- ========================================
-- Table: quest_sources
-- Actions to consolidate: ['SELECT']
-- ========================================

-- Step 1: Review current policies for quest_sources
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies 
WHERE tablename = 'quest_sources'
ORDER BY cmd, policyname;

-- Step 2: Consolidate SELECT policies for quest_sources
-- Current multiple policies by role:
--   Role 'anon': ['Only admins can manage quest sources', 'Public read access to quest sources']
--   Role 'authenticated': ['Only admins can manage quest sources', 'Public read access to quest sources']
--   Role 'authenticator': ['Only admins can manage quest sources', 'Public read access to quest sources']
--   Role 'dashboard_user': ['Only admins can manage quest sources', 'Public read access to quest sources']

-- Strategy: Multiple roles detected - manual review required
-- Consider creating role-specific consolidated policies
-- CREATE POLICY "quest_sources_select_anon" ON public.quest_sources
--   FOR SELECT TO anon
--   USING (combined_conditions_for_anon);
-- CREATE POLICY "quest_sources_select_authenticated" ON public.quest_sources
--   FOR SELECT TO authenticated
--   USING (combined_conditions_for_authenticated);
-- CREATE POLICY "quest_sources_select_authenticator" ON public.quest_sources
--   FOR SELECT TO authenticator
--   USING (combined_conditions_for_authenticator);
-- CREATE POLICY "quest_sources_select_dashboard_user" ON public.quest_sources
--   FOR SELECT TO dashboard_user
--   USING (combined_conditions_for_dashboard_user);


-- ========================================
-- Table: quest_submissions
-- Actions to consolidate: ['SELECT']
-- ========================================

-- Step 1: Review current policies for quest_submissions
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies 
WHERE tablename = 'quest_submissions'
ORDER BY cmd, policyname;

-- Step 2: Consolidate SELECT policies for quest_submissions
-- Current multiple policies by role:
--   Role 'anon': ['Admins can view all submissions', 'Users can view their own submissions']
--   Role 'authenticated': ['Admins can view all submissions', 'Users can view their own submissions']
--   Role 'authenticator': ['Admins can view all submissions', 'Users can view their own submissions']
--   Role 'dashboard_user': ['Admins can view all submissions', 'Users can view their own submissions']

-- Strategy: Multiple roles detected - manual review required
-- Consider creating role-specific consolidated policies
-- CREATE POLICY "quest_submissions_select_anon" ON public.quest_submissions
--   FOR SELECT TO anon
--   USING (combined_conditions_for_anon);
-- CREATE POLICY "quest_submissions_select_authenticated" ON public.quest_submissions
--   FOR SELECT TO authenticated
--   USING (combined_conditions_for_authenticated);
-- CREATE POLICY "quest_submissions_select_authenticator" ON public.quest_submissions
--   FOR SELECT TO authenticator
--   USING (combined_conditions_for_authenticator);
-- CREATE POLICY "quest_submissions_select_dashboard_user" ON public.quest_submissions
--   FOR SELECT TO dashboard_user
--   USING (combined_conditions_for_dashboard_user);


-- ========================================
-- Table: quest_tasks
-- Actions to consolidate: ['SELECT']
-- ========================================

-- Step 1: Review current policies for quest_tasks
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies 
WHERE tablename = 'quest_tasks'
ORDER BY cmd, policyname;

-- Step 2: Consolidate SELECT policies for quest_tasks
-- Current multiple policies by role:
--   Role 'anon': ['Only admins can manage quest tasks', 'Quest tasks viewable with quests']
--   Role 'authenticated': ['Only admins can manage quest tasks', 'Quest tasks viewable with quests']
--   Role 'authenticator': ['Only admins can manage quest tasks', 'Quest tasks viewable with quests']
--   Role 'dashboard_user': ['Only admins can manage quest tasks', 'Quest tasks viewable with quests']

-- Strategy: Multiple roles detected - manual review required
-- Consider creating role-specific consolidated policies
-- CREATE POLICY "quest_tasks_select_anon" ON public.quest_tasks
--   FOR SELECT TO anon
--   USING (combined_conditions_for_anon);
-- CREATE POLICY "quest_tasks_select_authenticated" ON public.quest_tasks
--   FOR SELECT TO authenticated
--   USING (combined_conditions_for_authenticated);
-- CREATE POLICY "quest_tasks_select_authenticator" ON public.quest_tasks
--   FOR SELECT TO authenticator
--   USING (combined_conditions_for_authenticator);
-- CREATE POLICY "quest_tasks_select_dashboard_user" ON public.quest_tasks
--   FOR SELECT TO dashboard_user
--   USING (combined_conditions_for_dashboard_user);


-- ========================================
-- Table: quests
-- Actions to consolidate: ['SELECT']
-- ========================================

-- Step 1: Review current policies for quests
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies 
WHERE tablename = 'quests'
ORDER BY cmd, policyname;

-- Step 2: Consolidate SELECT policies for quests
-- Current multiple policies by role:
--   Role 'anon': ['Only admins can manage quests', 'Quests are viewable by everyone']
--   Role 'authenticated': ['Only admins can manage quests', 'Quests are viewable by everyone']
--   Role 'authenticator': ['Only admins can manage quests', 'Quests are viewable by everyone']
--   Role 'dashboard_user': ['Only admins can manage quests', 'Quests are viewable by everyone']

-- Strategy: Multiple roles detected - manual review required
-- Consider creating role-specific consolidated policies
-- CREATE POLICY "quests_select_anon" ON public.quests
--   FOR SELECT TO anon
--   USING (combined_conditions_for_anon);
-- CREATE POLICY "quests_select_authenticated" ON public.quests
--   FOR SELECT TO authenticated
--   USING (combined_conditions_for_authenticated);
-- CREATE POLICY "quests_select_authenticator" ON public.quests
--   FOR SELECT TO authenticator
--   USING (combined_conditions_for_authenticator);
-- CREATE POLICY "quests_select_dashboard_user" ON public.quests
--   FOR SELECT TO dashboard_user
--   USING (combined_conditions_for_dashboard_user);


-- ========================================
-- Table: security_warnings_documentation
-- Actions to consolidate: ['SELECT']
-- ========================================

-- Step 1: Review current policies for security_warnings_documentation
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies 
WHERE tablename = 'security_warnings_documentation'
ORDER BY cmd, policyname;

-- Step 2: Consolidate SELECT policies for security_warnings_documentation
-- Current multiple policies by role:
--   Role 'anon': ['Only admins can manage security documentation', 'Public read access to security documentation']
--   Role 'authenticated': ['Only admins can manage security documentation', 'Public read access to security documentation']
--   Role 'authenticator': ['Only admins can manage security documentation', 'Public read access to security documentation']
--   Role 'dashboard_user': ['Only admins can manage security documentation', 'Public read access to security documentation']

-- Strategy: Multiple roles detected - manual review required
-- Consider creating role-specific consolidated policies
-- CREATE POLICY "security_warnings_documentation_select_anon" ON public.security_warnings_documentation
--   FOR SELECT TO anon
--   USING (combined_conditions_for_anon);
-- CREATE POLICY "security_warnings_documentation_select_authenticated" ON public.security_warnings_documentation
--   FOR SELECT TO authenticated
--   USING (combined_conditions_for_authenticated);
-- CREATE POLICY "security_warnings_documentation_select_authenticator" ON public.security_warnings_documentation
--   FOR SELECT TO authenticator
--   USING (combined_conditions_for_authenticator);
-- CREATE POLICY "security_warnings_documentation_select_dashboard_user" ON public.security_warnings_documentation
--   FOR SELECT TO dashboard_user
--   USING (combined_conditions_for_dashboard_user);


-- ========================================
-- Table: site_settings
-- Actions to consolidate: ['DELETE', 'INSERT', 'SELECT', 'UPDATE']
-- ========================================

-- Step 1: Review current policies for site_settings
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies 
WHERE tablename = 'site_settings'
ORDER BY cmd, policyname;

-- Step 2: Consolidate DELETE policies for site_settings
-- Current multiple policies by role:
--   Role 'anon': ['Admins can manage site settings', 'site_settings_admin_all']
--   Role 'authenticated': ['Admins can manage site settings', 'site_settings_admin_all']
--   Role 'authenticator': ['Admins can manage site settings', 'site_settings_admin_all']
--   Role 'dashboard_user': ['Admins can manage site settings', 'site_settings_admin_all']

-- Strategy: Multiple roles detected - manual review required
-- Consider creating role-specific consolidated policies
-- CREATE POLICY "site_settings_delete_anon" ON public.site_settings
--   FOR DELETE TO anon
--   USING (combined_conditions_for_anon);
-- CREATE POLICY "site_settings_delete_authenticated" ON public.site_settings
--   FOR DELETE TO authenticated
--   USING (combined_conditions_for_authenticated);
-- CREATE POLICY "site_settings_delete_authenticator" ON public.site_settings
--   FOR DELETE TO authenticator
--   USING (combined_conditions_for_authenticator);
-- CREATE POLICY "site_settings_delete_dashboard_user" ON public.site_settings
--   FOR DELETE TO dashboard_user
--   USING (combined_conditions_for_dashboard_user);

-- Step 2: Consolidate INSERT policies for site_settings
-- Current multiple policies by role:
--   Role 'anon': ['Admins can manage site settings', 'site_settings_admin_all']
--   Role 'authenticated': ['Admins can manage site settings', 'site_settings_admin_all']
--   Role 'authenticator': ['Admins can manage site settings', 'site_settings_admin_all']
--   Role 'dashboard_user': ['Admins can manage site settings', 'site_settings_admin_all']

-- Strategy: Multiple roles detected - manual review required
-- Consider creating role-specific consolidated policies
-- CREATE POLICY "site_settings_insert_anon" ON public.site_settings
--   FOR INSERT TO anon
--   USING (combined_conditions_for_anon);
-- CREATE POLICY "site_settings_insert_authenticated" ON public.site_settings
--   FOR INSERT TO authenticated
--   USING (combined_conditions_for_authenticated);
-- CREATE POLICY "site_settings_insert_authenticator" ON public.site_settings
--   FOR INSERT TO authenticator
--   USING (combined_conditions_for_authenticator);
-- CREATE POLICY "site_settings_insert_dashboard_user" ON public.site_settings
--   FOR INSERT TO dashboard_user
--   USING (combined_conditions_for_dashboard_user);

-- Step 2: Consolidate SELECT policies for site_settings
-- Current multiple policies by role:
--   Role 'anon': ['Admins can manage site settings', 'Public can read site settings', 'site_settings_admin_all', 'site_settings_public_read', 'site_settings_select', 'site_settings_select_all']
--   Role 'authenticated': ['Admins can manage site settings', 'Public can read site settings', 'site_settings_admin_all', 'site_settings_public_read', 'site_settings_select', 'site_settings_select_all']
--   Role 'authenticator': ['Admins can manage site settings', 'Public can read site settings', 'site_settings_admin_all', 'site_settings_public_read', 'site_settings_select', 'site_settings_select_all']
--   Role 'dashboard_user': ['Admins can manage site settings', 'Public can read site settings', 'site_settings_admin_all', 'site_settings_public_read', 'site_settings_select', 'site_settings_select_all']

-- Strategy: Multiple roles detected - manual review required
-- Consider creating role-specific consolidated policies
-- CREATE POLICY "site_settings_select_anon" ON public.site_settings
--   FOR SELECT TO anon
--   USING (combined_conditions_for_anon);
-- CREATE POLICY "site_settings_select_authenticated" ON public.site_settings
--   FOR SELECT TO authenticated
--   USING (combined_conditions_for_authenticated);
-- CREATE POLICY "site_settings_select_authenticator" ON public.site_settings
--   FOR SELECT TO authenticator
--   USING (combined_conditions_for_authenticator);
-- CREATE POLICY "site_settings_select_dashboard_user" ON public.site_settings
--   FOR SELECT TO dashboard_user
--   USING (combined_conditions_for_dashboard_user);

-- Step 2: Consolidate UPDATE policies for site_settings
-- Current multiple policies by role:
--   Role 'anon': ['Admins can manage site settings', 'site_settings_admin_all']
--   Role 'authenticated': ['Admins can manage site settings', 'site_settings_admin_all']
--   Role 'authenticator': ['Admins can manage site settings', 'site_settings_admin_all']
--   Role 'dashboard_user': ['Admins can manage site settings', 'site_settings_admin_all']

-- Strategy: Multiple roles detected - manual review required
-- Consider creating role-specific consolidated policies
-- CREATE POLICY "site_settings_update_anon" ON public.site_settings
--   FOR UPDATE TO anon
--   USING (combined_conditions_for_anon);
-- CREATE POLICY "site_settings_update_authenticated" ON public.site_settings
--   FOR UPDATE TO authenticated
--   USING (combined_conditions_for_authenticated);
-- CREATE POLICY "site_settings_update_authenticator" ON public.site_settings
--   FOR UPDATE TO authenticator
--   USING (combined_conditions_for_authenticator);
-- CREATE POLICY "site_settings_update_dashboard_user" ON public.site_settings
--   FOR UPDATE TO dashboard_user
--   USING (combined_conditions_for_dashboard_user);


-- ========================================
-- Table: tutor_tier_limits
-- Actions to consolidate: ['SELECT']
-- ========================================

-- Step 1: Review current policies for tutor_tier_limits
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies 
WHERE tablename = 'tutor_tier_limits'
ORDER BY cmd, policyname;

-- Step 2: Consolidate SELECT policies for tutor_tier_limits
-- Current multiple policies by role:
--   Role 'anon': ['All users can view tier limits', 'Service role can modify tier limits']
--   Role 'authenticated': ['All users can view tier limits', 'Service role can modify tier limits']
--   Role 'authenticator': ['All users can view tier limits', 'Service role can modify tier limits']
--   Role 'dashboard_user': ['All users can view tier limits', 'Service role can modify tier limits']

-- Strategy: Multiple roles detected - manual review required
-- Consider creating role-specific consolidated policies
-- CREATE POLICY "tutor_tier_limits_select_anon" ON public.tutor_tier_limits
--   FOR SELECT TO anon
--   USING (combined_conditions_for_anon);
-- CREATE POLICY "tutor_tier_limits_select_authenticated" ON public.tutor_tier_limits
--   FOR SELECT TO authenticated
--   USING (combined_conditions_for_authenticated);
-- CREATE POLICY "tutor_tier_limits_select_authenticator" ON public.tutor_tier_limits
--   FOR SELECT TO authenticator
--   USING (combined_conditions_for_authenticator);
-- CREATE POLICY "tutor_tier_limits_select_dashboard_user" ON public.tutor_tier_limits
--   FOR SELECT TO dashboard_user
--   USING (combined_conditions_for_dashboard_user);


-- ========================================
-- Table: user_achievements
-- Actions to consolidate: ['DELETE', 'INSERT', 'SELECT', 'UPDATE']
-- ========================================

-- Step 1: Review current policies for user_achievements
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies 
WHERE tablename = 'user_achievements'
ORDER BY cmd, policyname;

-- Step 2: Consolidate DELETE policies for user_achievements
-- Current multiple policies by role:
--   Role 'anon': ['user_achievements_admin_all', 'user_achievements_delete']
--   Role 'authenticated': ['user_achievements_admin_all', 'user_achievements_delete']
--   Role 'authenticator': ['user_achievements_admin_all', 'user_achievements_delete']
--   Role 'dashboard_user': ['user_achievements_admin_all', 'user_achievements_delete']

-- Strategy: Multiple roles detected - manual review required
-- Consider creating role-specific consolidated policies
-- CREATE POLICY "user_achievements_delete_anon" ON public.user_achievements
--   FOR DELETE TO anon
--   USING (combined_conditions_for_anon);
-- CREATE POLICY "user_achievements_delete_authenticated" ON public.user_achievements
--   FOR DELETE TO authenticated
--   USING (combined_conditions_for_authenticated);
-- CREATE POLICY "user_achievements_delete_authenticator" ON public.user_achievements
--   FOR DELETE TO authenticator
--   USING (combined_conditions_for_authenticator);
-- CREATE POLICY "user_achievements_delete_dashboard_user" ON public.user_achievements
--   FOR DELETE TO dashboard_user
--   USING (combined_conditions_for_dashboard_user);

-- Step 2: Consolidate INSERT policies for user_achievements
-- Current multiple policies by role:
--   Role 'anon': ['user_achievements_admin_all', 'user_achievements_insert', 'user_achievements_insert_system']
--   Role 'authenticated': ['user_achievements_admin_all', 'user_achievements_insert', 'user_achievements_insert_system']
--   Role 'authenticator': ['user_achievements_admin_all', 'user_achievements_insert', 'user_achievements_insert_system']
--   Role 'dashboard_user': ['user_achievements_admin_all', 'user_achievements_insert', 'user_achievements_insert_system']

-- Strategy: Multiple roles detected - manual review required
-- Consider creating role-specific consolidated policies
-- CREATE POLICY "user_achievements_insert_anon" ON public.user_achievements
--   FOR INSERT TO anon
--   USING (combined_conditions_for_anon);
-- CREATE POLICY "user_achievements_insert_authenticated" ON public.user_achievements
--   FOR INSERT TO authenticated
--   USING (combined_conditions_for_authenticated);
-- CREATE POLICY "user_achievements_insert_authenticator" ON public.user_achievements
--   FOR INSERT TO authenticator
--   USING (combined_conditions_for_authenticator);
-- CREATE POLICY "user_achievements_insert_dashboard_user" ON public.user_achievements
--   FOR INSERT TO dashboard_user
--   USING (combined_conditions_for_dashboard_user);

-- Step 2: Consolidate SELECT policies for user_achievements
-- Current multiple policies by role:
--   Role 'anon': ['user_achievements_admin_all', 'user_achievements_select', 'user_achievements_select_own']
--   Role 'authenticated': ['user_achievements_admin_all', 'user_achievements_select', 'user_achievements_select_own']
--   Role 'authenticator': ['user_achievements_admin_all', 'user_achievements_select', 'user_achievements_select_own']
--   Role 'dashboard_user': ['user_achievements_admin_all', 'user_achievements_select', 'user_achievements_select_own']

-- Strategy: Multiple roles detected - manual review required
-- Consider creating role-specific consolidated policies
-- CREATE POLICY "user_achievements_select_anon" ON public.user_achievements
--   FOR SELECT TO anon
--   USING (combined_conditions_for_anon);
-- CREATE POLICY "user_achievements_select_authenticated" ON public.user_achievements
--   FOR SELECT TO authenticated
--   USING (combined_conditions_for_authenticated);
-- CREATE POLICY "user_achievements_select_authenticator" ON public.user_achievements
--   FOR SELECT TO authenticator
--   USING (combined_conditions_for_authenticator);
-- CREATE POLICY "user_achievements_select_dashboard_user" ON public.user_achievements
--   FOR SELECT TO dashboard_user
--   USING (combined_conditions_for_dashboard_user);

-- Step 2: Consolidate UPDATE policies for user_achievements
-- Current multiple policies by role:
--   Role 'anon': ['user_achievements_admin_all', 'user_achievements_update']
--   Role 'authenticated': ['user_achievements_admin_all', 'user_achievements_update']
--   Role 'authenticator': ['user_achievements_admin_all', 'user_achievements_update']
--   Role 'dashboard_user': ['user_achievements_admin_all', 'user_achievements_update']

-- Strategy: Multiple roles detected - manual review required
-- Consider creating role-specific consolidated policies
-- CREATE POLICY "user_achievements_update_anon" ON public.user_achievements
--   FOR UPDATE TO anon
--   USING (combined_conditions_for_anon);
-- CREATE POLICY "user_achievements_update_authenticated" ON public.user_achievements
--   FOR UPDATE TO authenticated
--   USING (combined_conditions_for_authenticated);
-- CREATE POLICY "user_achievements_update_authenticator" ON public.user_achievements
--   FOR UPDATE TO authenticator
--   USING (combined_conditions_for_authenticator);
-- CREATE POLICY "user_achievements_update_dashboard_user" ON public.user_achievements
--   FOR UPDATE TO dashboard_user
--   USING (combined_conditions_for_dashboard_user);


-- ========================================
-- Table: user_badges
-- Actions to consolidate: ['SELECT']
-- ========================================

-- Step 1: Review current policies for user_badges
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies 
WHERE tablename = 'user_badges'
ORDER BY cmd, policyname;

-- Step 2: Consolidate SELECT policies for user_badges
-- Current multiple policies by role:
--   Role 'anon': ['Only system can manage user badges', 'Public access to user badges for diplomas', 'Users can view their own badges']
--   Role 'authenticated': ['Only system can manage user badges', 'Public access to user badges for diplomas', 'Users can view their own badges']
--   Role 'authenticator': ['Only system can manage user badges', 'Public access to user badges for diplomas', 'Users can view their own badges']
--   Role 'dashboard_user': ['Only system can manage user badges', 'Public access to user badges for diplomas', 'Users can view their own badges']

-- Strategy: Multiple roles detected - manual review required
-- Consider creating role-specific consolidated policies
-- CREATE POLICY "user_badges_select_anon" ON public.user_badges
--   FOR SELECT TO anon
--   USING (combined_conditions_for_anon);
-- CREATE POLICY "user_badges_select_authenticated" ON public.user_badges
--   FOR SELECT TO authenticated
--   USING (combined_conditions_for_authenticated);
-- CREATE POLICY "user_badges_select_authenticator" ON public.user_badges
--   FOR SELECT TO authenticator
--   USING (combined_conditions_for_authenticator);
-- CREATE POLICY "user_badges_select_dashboard_user" ON public.user_badges
--   FOR SELECT TO dashboard_user
--   USING (combined_conditions_for_dashboard_user);


-- ========================================
-- Table: user_mastery
-- Actions to consolidate: ['SELECT']
-- ========================================

-- Step 1: Review current policies for user_mastery
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies 
WHERE tablename = 'user_mastery'
ORDER BY cmd, policyname;

-- Step 2: Consolidate SELECT policies for user_mastery
-- Current multiple policies by role:
--   Role 'anon': ['Public mastery viewing for diplomas', 'Users can view their own mastery']
--   Role 'authenticated': ['Public mastery viewing for diplomas', 'Users can view their own mastery']
--   Role 'authenticator': ['Public mastery viewing for diplomas', 'Users can view their own mastery']
--   Role 'dashboard_user': ['Public mastery viewing for diplomas', 'Users can view their own mastery']

-- Strategy: Multiple roles detected - manual review required
-- Consider creating role-specific consolidated policies
-- CREATE POLICY "user_mastery_select_anon" ON public.user_mastery
--   FOR SELECT TO anon
--   USING (combined_conditions_for_anon);
-- CREATE POLICY "user_mastery_select_authenticated" ON public.user_mastery
--   FOR SELECT TO authenticated
--   USING (combined_conditions_for_authenticated);
-- CREATE POLICY "user_mastery_select_authenticator" ON public.user_mastery
--   FOR SELECT TO authenticator
--   USING (combined_conditions_for_authenticator);
-- CREATE POLICY "user_mastery_select_dashboard_user" ON public.user_mastery
--   FOR SELECT TO dashboard_user
--   USING (combined_conditions_for_dashboard_user);


-- ========================================
-- Table: user_skill_details
-- Actions to consolidate: ['INSERT', 'SELECT', 'UPDATE']
-- ========================================

-- Step 1: Review current policies for user_skill_details
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies 
WHERE tablename = 'user_skill_details'
ORDER BY cmd, policyname;

-- Step 2: Consolidate INSERT policies for user_skill_details
-- Current multiple policies by role:
--   Role 'anon': ['Service role can manage skill details', 'User skill details insertable by system']
--   Role 'authenticated': ['Service role can manage skill details', 'User skill details insertable by system']
--   Role 'authenticator': ['Service role can manage skill details', 'User skill details insertable by system']
--   Role 'dashboard_user': ['Service role can manage skill details', 'User skill details insertable by system']

-- Strategy: Multiple roles detected - manual review required
-- Consider creating role-specific consolidated policies
-- CREATE POLICY "user_skill_details_insert_anon" ON public.user_skill_details
--   FOR INSERT TO anon
--   USING (combined_conditions_for_anon);
-- CREATE POLICY "user_skill_details_insert_authenticated" ON public.user_skill_details
--   FOR INSERT TO authenticated
--   USING (combined_conditions_for_authenticated);
-- CREATE POLICY "user_skill_details_insert_authenticator" ON public.user_skill_details
--   FOR INSERT TO authenticator
--   USING (combined_conditions_for_authenticator);
-- CREATE POLICY "user_skill_details_insert_dashboard_user" ON public.user_skill_details
--   FOR INSERT TO dashboard_user
--   USING (combined_conditions_for_dashboard_user);

-- Step 2: Consolidate SELECT policies for user_skill_details
-- Current multiple policies by role:
--   Role 'anon': ['Service role can manage skill details', 'Users can view their own skill details']
--   Role 'authenticated': ['Service role can manage skill details', 'Users can view their own skill details']
--   Role 'authenticator': ['Service role can manage skill details', 'Users can view their own skill details']
--   Role 'dashboard_user': ['Service role can manage skill details', 'Users can view their own skill details']

-- Strategy: Multiple roles detected - manual review required
-- Consider creating role-specific consolidated policies
-- CREATE POLICY "user_skill_details_select_anon" ON public.user_skill_details
--   FOR SELECT TO anon
--   USING (combined_conditions_for_anon);
-- CREATE POLICY "user_skill_details_select_authenticated" ON public.user_skill_details
--   FOR SELECT TO authenticated
--   USING (combined_conditions_for_authenticated);
-- CREATE POLICY "user_skill_details_select_authenticator" ON public.user_skill_details
--   FOR SELECT TO authenticator
--   USING (combined_conditions_for_authenticator);
-- CREATE POLICY "user_skill_details_select_dashboard_user" ON public.user_skill_details
--   FOR SELECT TO dashboard_user
--   USING (combined_conditions_for_dashboard_user);

-- Step 2: Consolidate UPDATE policies for user_skill_details
-- Current multiple policies by role:
--   Role 'anon': ['Service role can manage skill details', 'User skill details updatable by system']
--   Role 'authenticated': ['Service role can manage skill details', 'User skill details updatable by system']
--   Role 'authenticator': ['Service role can manage skill details', 'User skill details updatable by system']
--   Role 'dashboard_user': ['Service role can manage skill details', 'User skill details updatable by system']

-- Strategy: Multiple roles detected - manual review required
-- Consider creating role-specific consolidated policies
-- CREATE POLICY "user_skill_details_update_anon" ON public.user_skill_details
--   FOR UPDATE TO anon
--   USING (combined_conditions_for_anon);
-- CREATE POLICY "user_skill_details_update_authenticated" ON public.user_skill_details
--   FOR UPDATE TO authenticated
--   USING (combined_conditions_for_authenticated);
-- CREATE POLICY "user_skill_details_update_authenticator" ON public.user_skill_details
--   FOR UPDATE TO authenticator
--   USING (combined_conditions_for_authenticator);
-- CREATE POLICY "user_skill_details_update_dashboard_user" ON public.user_skill_details
--   FOR UPDATE TO dashboard_user
--   USING (combined_conditions_for_dashboard_user);


-- ========================================
-- Table: user_skill_xp
-- Actions to consolidate: ['SELECT']
-- ========================================

-- Step 1: Review current policies for user_skill_xp
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies 
WHERE tablename = 'user_skill_xp'
ORDER BY cmd, policyname;

-- Step 2: Consolidate SELECT policies for user_skill_xp
-- Current multiple policies by role:
--   Role 'anon': ['Public XP viewing for diplomas', 'Users can view their own XP']
--   Role 'authenticated': ['Public XP viewing for diplomas', 'Users can view their own XP']
--   Role 'authenticator': ['Public XP viewing for diplomas', 'Users can view their own XP']
--   Role 'dashboard_user': ['Public XP viewing for diplomas', 'Users can view their own XP']

-- Strategy: Multiple roles detected - manual review required
-- Consider creating role-specific consolidated policies
-- CREATE POLICY "user_skill_xp_select_anon" ON public.user_skill_xp
--   FOR SELECT TO anon
--   USING (combined_conditions_for_anon);
-- CREATE POLICY "user_skill_xp_select_authenticated" ON public.user_skill_xp
--   FOR SELECT TO authenticated
--   USING (combined_conditions_for_authenticated);
-- CREATE POLICY "user_skill_xp_select_authenticator" ON public.user_skill_xp
--   FOR SELECT TO authenticator
--   USING (combined_conditions_for_authenticator);
-- CREATE POLICY "user_skill_xp_select_dashboard_user" ON public.user_skill_xp
--   FOR SELECT TO dashboard_user
--   USING (combined_conditions_for_dashboard_user);


-- ========================================
-- Table: user_subject_xp
-- Actions to consolidate: ['SELECT']
-- ========================================

-- Step 1: Review current policies for user_subject_xp
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies 
WHERE tablename = 'user_subject_xp'
ORDER BY cmd, policyname;

-- Step 2: Consolidate SELECT policies for user_subject_xp
-- Current multiple policies by role:
--   Role 'anon': ['Public subject XP viewing for diplomas', 'System can manage subject XP', 'Users can view their own subject XP']
--   Role 'authenticated': ['Public subject XP viewing for diplomas', 'System can manage subject XP', 'Users can view their own subject XP']
--   Role 'authenticator': ['Public subject XP viewing for diplomas', 'System can manage subject XP', 'Users can view their own subject XP']
--   Role 'dashboard_user': ['Public subject XP viewing for diplomas', 'System can manage subject XP', 'Users can view their own subject XP']

-- Strategy: Multiple roles detected - manual review required
-- Consider creating role-specific consolidated policies
-- CREATE POLICY "user_subject_xp_select_anon" ON public.user_subject_xp
--   FOR SELECT TO anon
--   USING (combined_conditions_for_anon);
-- CREATE POLICY "user_subject_xp_select_authenticated" ON public.user_subject_xp
--   FOR SELECT TO authenticated
--   USING (combined_conditions_for_authenticated);
-- CREATE POLICY "user_subject_xp_select_authenticator" ON public.user_subject_xp
--   FOR SELECT TO authenticator
--   USING (combined_conditions_for_authenticator);
-- CREATE POLICY "user_subject_xp_select_dashboard_user" ON public.user_subject_xp
--   FOR SELECT TO dashboard_user
--   USING (combined_conditions_for_dashboard_user);


-- ========================================
-- Table: user_task_evidence_documents
-- Actions to consolidate: ['SELECT']
-- ========================================

-- Step 1: Review current policies for user_task_evidence_documents
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies 
WHERE tablename = 'user_task_evidence_documents'
ORDER BY cmd, policyname;

-- Step 2: Consolidate SELECT policies for user_task_evidence_documents
-- Current multiple policies by role:
--   Role 'anon': ['Public can view completed evidence for diplomas', 'Users can view their own evidence documents']
--   Role 'authenticated': ['Public can view completed evidence for diplomas', 'Users can view their own evidence documents']
--   Role 'authenticator': ['Public can view completed evidence for diplomas', 'Users can view their own evidence documents']
--   Role 'dashboard_user': ['Public can view completed evidence for diplomas', 'Users can view their own evidence documents']

-- Strategy: Multiple roles detected - manual review required
-- Consider creating role-specific consolidated policies
-- CREATE POLICY "user_task_evidence_documents_select_anon" ON public.user_task_evidence_documents
--   FOR SELECT TO anon
--   USING (combined_conditions_for_anon);
-- CREATE POLICY "user_task_evidence_documents_select_authenticated" ON public.user_task_evidence_documents
--   FOR SELECT TO authenticated
--   USING (combined_conditions_for_authenticated);
-- CREATE POLICY "user_task_evidence_documents_select_authenticator" ON public.user_task_evidence_documents
--   FOR SELECT TO authenticator
--   USING (combined_conditions_for_authenticator);
-- CREATE POLICY "user_task_evidence_documents_select_dashboard_user" ON public.user_task_evidence_documents
--   FOR SELECT TO dashboard_user
--   USING (combined_conditions_for_dashboard_user);


-- ========================================
-- Table: user_xp
-- Actions to consolidate: ['DELETE', 'INSERT', 'SELECT', 'UPDATE']
-- ========================================

-- Step 1: Review current policies for user_xp
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies 
WHERE tablename = 'user_xp'
ORDER BY cmd, policyname;

-- Step 2: Consolidate DELETE policies for user_xp
-- Current multiple policies by role:
--   Role 'anon': ['Service role can manage all XP', 'user_xp_admin_all']
--   Role 'authenticated': ['Service role can manage all XP', 'user_xp_admin_all']
--   Role 'authenticator': ['Service role can manage all XP', 'user_xp_admin_all']
--   Role 'dashboard_user': ['Service role can manage all XP', 'user_xp_admin_all']

-- Strategy: Multiple roles detected - manual review required
-- Consider creating role-specific consolidated policies
-- CREATE POLICY "user_xp_delete_anon" ON public.user_xp
--   FOR DELETE TO anon
--   USING (combined_conditions_for_anon);
-- CREATE POLICY "user_xp_delete_authenticated" ON public.user_xp
--   FOR DELETE TO authenticated
--   USING (combined_conditions_for_authenticated);
-- CREATE POLICY "user_xp_delete_authenticator" ON public.user_xp
--   FOR DELETE TO authenticator
--   USING (combined_conditions_for_authenticator);
-- CREATE POLICY "user_xp_delete_dashboard_user" ON public.user_xp
--   FOR DELETE TO dashboard_user
--   USING (combined_conditions_for_dashboard_user);

-- Step 2: Consolidate INSERT policies for user_xp
-- Current multiple policies by role:
--   Role 'anon': ['Service role can manage all XP', 'user_xp_admin_all', 'user_xp_insert_own']
--   Role 'authenticated': ['Service role can manage all XP', 'user_xp_admin_all', 'user_xp_insert_own']
--   Role 'authenticator': ['Service role can manage all XP', 'user_xp_admin_all', 'user_xp_insert_own']
--   Role 'dashboard_user': ['Service role can manage all XP', 'user_xp_admin_all', 'user_xp_insert_own']

-- Strategy: Multiple roles detected - manual review required
-- Consider creating role-specific consolidated policies
-- CREATE POLICY "user_xp_insert_anon" ON public.user_xp
--   FOR INSERT TO anon
--   USING (combined_conditions_for_anon);
-- CREATE POLICY "user_xp_insert_authenticated" ON public.user_xp
--   FOR INSERT TO authenticated
--   USING (combined_conditions_for_authenticated);
-- CREATE POLICY "user_xp_insert_authenticator" ON public.user_xp
--   FOR INSERT TO authenticator
--   USING (combined_conditions_for_authenticator);
-- CREATE POLICY "user_xp_insert_dashboard_user" ON public.user_xp
--   FOR INSERT TO dashboard_user
--   USING (combined_conditions_for_dashboard_user);

-- Step 2: Consolidate SELECT policies for user_xp
-- Current multiple policies by role:
--   Role 'anon': ['Service role can manage all XP', 'Users can view their own XP', 'user_xp_admin_all', 'user_xp_select_all']
--   Role 'authenticated': ['Service role can manage all XP', 'Users can view their own XP', 'user_xp_admin_all', 'user_xp_select_all']
--   Role 'authenticator': ['Service role can manage all XP', 'Users can view their own XP', 'user_xp_admin_all', 'user_xp_select_all']
--   Role 'dashboard_user': ['Service role can manage all XP', 'Users can view their own XP', 'user_xp_admin_all', 'user_xp_select_all']

-- Strategy: Multiple roles detected - manual review required
-- Consider creating role-specific consolidated policies
-- CREATE POLICY "user_xp_select_anon" ON public.user_xp
--   FOR SELECT TO anon
--   USING (combined_conditions_for_anon);
-- CREATE POLICY "user_xp_select_authenticated" ON public.user_xp
--   FOR SELECT TO authenticated
--   USING (combined_conditions_for_authenticated);
-- CREATE POLICY "user_xp_select_authenticator" ON public.user_xp
--   FOR SELECT TO authenticator
--   USING (combined_conditions_for_authenticator);
-- CREATE POLICY "user_xp_select_dashboard_user" ON public.user_xp
--   FOR SELECT TO dashboard_user
--   USING (combined_conditions_for_dashboard_user);

-- Step 2: Consolidate UPDATE policies for user_xp
-- Current multiple policies by role:
--   Role 'anon': ['Service role can manage all XP', 'user_xp_admin_all', 'user_xp_update_own']
--   Role 'authenticated': ['Service role can manage all XP', 'user_xp_admin_all', 'user_xp_update_own']
--   Role 'authenticator': ['Service role can manage all XP', 'user_xp_admin_all', 'user_xp_update_own']
--   Role 'dashboard_user': ['Service role can manage all XP', 'user_xp_admin_all', 'user_xp_update_own']

-- Strategy: Multiple roles detected - manual review required
-- Consider creating role-specific consolidated policies
-- CREATE POLICY "user_xp_update_anon" ON public.user_xp
--   FOR UPDATE TO anon
--   USING (combined_conditions_for_anon);
-- CREATE POLICY "user_xp_update_authenticated" ON public.user_xp
--   FOR UPDATE TO authenticated
--   USING (combined_conditions_for_authenticated);
-- CREATE POLICY "user_xp_update_authenticator" ON public.user_xp
--   FOR UPDATE TO authenticator
--   USING (combined_conditions_for_authenticator);
-- CREATE POLICY "user_xp_update_dashboard_user" ON public.user_xp
--   FOR UPDATE TO dashboard_user
--   USING (combined_conditions_for_dashboard_user);


-- ========================================
-- Table: users
-- Actions to consolidate: ['INSERT', 'SELECT', 'UPDATE']
-- ========================================

-- Step 1: Review current policies for users
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies 
WHERE tablename = 'users'
ORDER BY cmd, policyname;

-- Step 2: Consolidate INSERT policies for users
-- Current multiple policies by role:
--   Role 'anon': ['users_admin_access', 'users_can_insert_own', 'users_insert_own']
--   Role 'authenticated': ['users_admin_access', 'users_can_insert_own', 'users_insert_own']
--   Role 'authenticator': ['users_admin_access', 'users_can_insert_own', 'users_insert_own']
--   Role 'dashboard_user': ['users_admin_access', 'users_can_insert_own', 'users_insert_own']

-- Strategy: Multiple roles detected - manual review required
-- Consider creating role-specific consolidated policies
-- CREATE POLICY "users_insert_anon" ON public.users
--   FOR INSERT TO anon
--   USING (combined_conditions_for_anon);
-- CREATE POLICY "users_insert_authenticated" ON public.users
--   FOR INSERT TO authenticated
--   USING (combined_conditions_for_authenticated);
-- CREATE POLICY "users_insert_authenticator" ON public.users
--   FOR INSERT TO authenticator
--   USING (combined_conditions_for_authenticator);
-- CREATE POLICY "users_insert_dashboard_user" ON public.users
--   FOR INSERT TO dashboard_user
--   USING (combined_conditions_for_dashboard_user);

-- Step 2: Consolidate SELECT policies for users
-- Current multiple policies by role:
--   Role 'anon': ['users_admin_access', 'users_can_read_own', 'users_select_own']
--   Role 'authenticated': ['users_admin_access', 'users_can_read_own', 'users_select_own']
--   Role 'authenticator': ['users_admin_access', 'users_can_read_own', 'users_select_own']
--   Role 'dashboard_user': ['users_admin_access', 'users_can_read_own', 'users_select_own']

-- Strategy: Multiple roles detected - manual review required
-- Consider creating role-specific consolidated policies
-- CREATE POLICY "users_select_anon" ON public.users
--   FOR SELECT TO anon
--   USING (combined_conditions_for_anon);
-- CREATE POLICY "users_select_authenticated" ON public.users
--   FOR SELECT TO authenticated
--   USING (combined_conditions_for_authenticated);
-- CREATE POLICY "users_select_authenticator" ON public.users
--   FOR SELECT TO authenticator
--   USING (combined_conditions_for_authenticator);
-- CREATE POLICY "users_select_dashboard_user" ON public.users
--   FOR SELECT TO dashboard_user
--   USING (combined_conditions_for_dashboard_user);

-- Step 2: Consolidate UPDATE policies for users
-- Current multiple policies by role:
--   Role 'anon': ['users_admin_access', 'users_can_update_own', 'users_update_own']
--   Role 'authenticated': ['users_admin_access', 'users_can_update_own', 'users_update_own']
--   Role 'authenticator': ['users_admin_access', 'users_can_update_own', 'users_update_own']
--   Role 'dashboard_user': ['users_admin_access', 'users_can_update_own', 'users_update_own']

-- Strategy: Multiple roles detected - manual review required
-- Consider creating role-specific consolidated policies
-- CREATE POLICY "users_update_anon" ON public.users
--   FOR UPDATE TO anon
--   USING (combined_conditions_for_anon);
-- CREATE POLICY "users_update_authenticated" ON public.users
--   FOR UPDATE TO authenticated
--   USING (combined_conditions_for_authenticated);
-- CREATE POLICY "users_update_authenticator" ON public.users
--   FOR UPDATE TO authenticator
--   USING (combined_conditions_for_authenticator);
-- CREATE POLICY "users_update_dashboard_user" ON public.users
--   FOR UPDATE TO dashboard_user
--   USING (combined_conditions_for_dashboard_user);


-- ========================================
-- Helper Queries
-- ========================================

-- Get all policies that need consolidation:

SELECT
  tablename,
  cmd,
  array_agg(policyname) as policies,
  count(*) as policy_count
FROM pg_policies
WHERE tablename IN ('activity_log', 'advisor_group_members', 'advisor_groups', 'diplomas', 'evidence_document_blocks', 'friendships', 'leaderboards', 'parent_child_relationships', 'pillar_subcategories', 'quest_customizations', 'quest_ideas', 'quest_metadata', 'quest_paths', 'quest_ratings', 'quest_reviews', 'quest_sources', 'quest_submissions', 'quest_tasks', 'quests', 'security_warnings_documentation', 'site_settings', 'tutor_tier_limits', 'user_achievements', 'user_badges', 'user_mastery', 'user_skill_details', 'user_skill_xp', 'user_subject_xp', 'user_task_evidence_documents', 'user_xp', 'users')
  AND permissive = 'PERMISSIVE'
GROUP BY tablename, cmd, roles
HAVING count(*) > 1
ORDER BY tablename, cmd;


-- Get policy definitions for manual review:

SELECT
  tablename || '.' || policyname as policy_id,
  cmd,
  roles,
  'USING: ' || COALESCE(qual, 'NULL') as using_clause,
  'CHECK: ' || COALESCE(with_check, 'NULL') as check_clause
FROM pg_policies
WHERE tablename IN ('activity_log', 'advisor_group_members', 'advisor_groups', 'diplomas', 'evidence_document_blocks', 'friendships', 'leaderboards', 'parent_child_relationships', 'pillar_subcategories', 'quest_customizations', 'quest_ideas', 'quest_metadata', 'quest_paths', 'quest_ratings', 'quest_reviews', 'quest_sources', 'quest_submissions', 'quest_tasks', 'quests', 'security_warnings_documentation', 'site_settings', 'tutor_tier_limits', 'user_achievements', 'user_badges', 'user_mastery', 'user_skill_details', 'user_skill_xp', 'user_subject_xp', 'user_task_evidence_documents', 'user_xp', 'users')
  AND permissive = 'PERMISSIVE'
ORDER BY tablename, cmd, policyname;
