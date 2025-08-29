-- Performance fixes for RLS policies
-- Generated on 2025-01-08

-- =============================================
-- FIX AUTH RLS INITIALIZATION PERFORMANCE ISSUES
-- Replace auth.uid() with (SELECT auth.uid()) for better performance
-- =============================================

-- Fix user_xp policies
DROP POLICY IF EXISTS "Users can view their own XP" ON public.user_xp;
CREATE POLICY "Users can view their own XP" ON public.user_xp
  FOR SELECT USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Service role can manage all XP" ON public.user_xp;
CREATE POLICY "Service role can manage all XP" ON public.user_xp
  FOR ALL USING (
    (SELECT current_setting('request.jwt.claims', true)::json->>'role') = 'service_role'
  );

-- Fix user_skill_details policies
DROP POLICY IF EXISTS "Users can view their own skill details" ON public.user_skill_details;
CREATE POLICY "Users can view their own skill details" ON public.user_skill_details
  FOR SELECT USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Service role can manage skill details" ON public.user_skill_details;
CREATE POLICY "Service role can manage skill details" ON public.user_skill_details
  FOR ALL USING (
    (SELECT current_setting('request.jwt.claims', true)::json->>'role') = 'service_role'
  );

-- Fix diplomas policies
DROP POLICY IF EXISTS "Diplomas viewable by owner or if public" ON public.diplomas;
CREATE POLICY "Diplomas viewable by owner or if public" ON public.diplomas
  FOR SELECT USING (
    user_id = (SELECT auth.uid()) OR is_public = true
  );

DROP POLICY IF EXISTS "Diplomas updatable by owner" ON public.diplomas;
CREATE POLICY "Diplomas updatable by owner" ON public.diplomas
  FOR UPDATE USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Users can view own diploma" ON public.diplomas;
CREATE POLICY "Users can view own diploma" ON public.diplomas
  FOR SELECT USING (user_id = (SELECT auth.uid()));

-- Fix user_quests policies
DROP POLICY IF EXISTS "Users can update own quest progress" ON public.user_quests;
CREATE POLICY "Users can update own quest progress" ON public.user_quests
  FOR UPDATE USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Users can view own quest enrollments" ON public.user_quests;
CREATE POLICY "Users can view own quest enrollments" ON public.user_quests
  FOR SELECT USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Users can enroll in quests" ON public.user_quests;
CREATE POLICY "Users can enroll in quests" ON public.user_quests
  FOR INSERT WITH CHECK (user_id = (SELECT auth.uid()));

-- Fix user_quest_tasks policies (if they exist)
DROP POLICY IF EXISTS "Users can view own task completions" ON public.user_quest_tasks;
CREATE POLICY "Users can view own task completions" ON public.user_quest_tasks
  FOR SELECT USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Users can complete tasks" ON public.user_quest_tasks;
CREATE POLICY "Users can complete tasks" ON public.user_quest_tasks
  FOR INSERT WITH CHECK (user_id = (SELECT auth.uid()));

-- Fix user_skill_xp policies
DROP POLICY IF EXISTS "Users can view own XP" ON public.user_skill_xp;
CREATE POLICY "Users can view own XP" ON public.user_skill_xp
  FOR SELECT USING (user_id = (SELECT auth.uid()));

-- Fix activity_log policies
DROP POLICY IF EXISTS "Users can view own activity" ON public.activity_log;
CREATE POLICY "Users can view own activity" ON public.activity_log
  FOR SELECT USING (user_id = (SELECT auth.uid()));

-- Fix parent_child_relationships policies
DROP POLICY IF EXISTS "Parents can view their relationships" ON public.parent_child_relationships;
CREATE POLICY "Parents can view their relationships" ON public.parent_child_relationships
  FOR SELECT USING (parent_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Children can view their parent relationships" ON public.parent_child_relationships;
CREATE POLICY "Children can view their parent relationships" ON public.parent_child_relationships
  FOR SELECT USING (child_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Admins can manage all relationships" ON public.parent_child_relationships;
CREATE POLICY "Admins can manage all relationships" ON public.parent_child_relationships
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = (SELECT auth.uid())
      AND users.role = 'admin'
    )
  );

-- Fix advisor_groups policies
DROP POLICY IF EXISTS "Advisors can manage their groups" ON public.advisor_groups;
CREATE POLICY "Advisors can manage their groups" ON public.advisor_groups
  FOR ALL USING (advisor_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Students can view groups they're in" ON public.advisor_groups;
CREATE POLICY "Students can view groups they're in" ON public.advisor_groups
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.advisor_group_members
      WHERE advisor_group_members.group_id = advisor_groups.id
      AND advisor_group_members.student_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Admins can manage all groups" ON public.advisor_groups;
CREATE POLICY "Admins can manage all groups" ON public.advisor_groups
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = (SELECT auth.uid())
      AND users.role = 'admin'
    )
  );

-- Fix quest_ideas policies
DROP POLICY IF EXISTS "Users can manage their own quest ideas" ON public.quest_ideas;
CREATE POLICY "Users can manage their own quest ideas" ON public.quest_ideas
  FOR ALL USING (user_id = (SELECT auth.uid()));

-- Fix quest_ratings policies
DROP POLICY IF EXISTS "Users can manage their own quest ratings" ON public.quest_ratings;
CREATE POLICY "Users can manage their own quest ratings" ON public.quest_ratings
  FOR ALL USING (user_id = (SELECT auth.uid()));

-- Fix site_settings policies
DROP POLICY IF EXISTS "Admins can manage site settings" ON public.site_settings;
CREATE POLICY "Admins can manage site settings" ON public.site_settings
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = (SELECT auth.uid())
      AND users.role = 'admin'
    )
  );

-- Fix users policies
DROP POLICY IF EXISTS "Users can view own profile" ON public.users;
CREATE POLICY "Users can view own profile" ON public.users
  FOR SELECT USING (id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Users can update own profile" ON public.users;
CREATE POLICY "Users can update own profile" ON public.users
  FOR UPDATE USING (id = (SELECT auth.uid()))
  WITH CHECK (id = (SELECT auth.uid()));

-- Fix advisor_group_members policies (consolidate multiple permissive policies)
-- Drop all existing policies first
DROP POLICY IF EXISTS "Advisors can manage their group members" ON public.advisor_group_members;
DROP POLICY IF EXISTS "Students can view their group memberships" ON public.advisor_group_members;
DROP POLICY IF EXISTS "Admins can manage all memberships" ON public.advisor_group_members;

-- Create consolidated policies with better performance
CREATE POLICY "Users can view relevant group memberships" ON public.advisor_group_members
  FOR SELECT USING (
    student_id = (SELECT auth.uid()) OR
    EXISTS (
      SELECT 1 FROM public.advisor_groups
      WHERE advisor_groups.id = advisor_group_members.group_id
      AND advisor_groups.advisor_id = (SELECT auth.uid())
    ) OR
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = (SELECT auth.uid())
      AND users.role = 'admin'
    )
  );

CREATE POLICY "Advisors and admins can manage group members" ON public.advisor_group_members
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.advisor_groups
      WHERE advisor_groups.id = group_id
      AND advisor_groups.advisor_id = (SELECT auth.uid())
    ) OR
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = (SELECT auth.uid())
      AND users.role = 'admin'
    )
  );

CREATE POLICY "Advisors and admins can update group members" ON public.advisor_group_members
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.advisor_groups
      WHERE advisor_groups.id = advisor_group_members.group_id
      AND advisor_groups.advisor_id = (SELECT auth.uid())
    ) OR
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = (SELECT auth.uid())
      AND users.role = 'admin'
    )
  );

CREATE POLICY "Advisors and admins can delete group members" ON public.advisor_group_members
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.advisor_groups
      WHERE advisor_groups.id = advisor_group_members.group_id
      AND advisor_groups.advisor_id = (SELECT auth.uid())
    ) OR
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = (SELECT auth.uid())
      AND users.role = 'admin'
    )
  );

-- Fix role_change_log policies
DROP POLICY IF EXISTS "Only admins can view role changes" ON public.role_change_log;
CREATE POLICY "Only admins can view role changes" ON public.role_change_log
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = (SELECT auth.uid())
      AND users.role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Only admins can insert role changes" ON public.role_change_log;
CREATE POLICY "Only admins can insert role changes" ON public.role_change_log
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = (SELECT auth.uid())
      AND users.role = 'admin'
    )
  );