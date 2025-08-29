-- Final Security and Performance Fix
-- Based on ACTUAL production schema provided
-- Generated on 2025-01-08

-- =============================================
-- PART 1: ENABLE RLS ON UNPROTECTED TABLES
-- =============================================

-- These tables currently have no RLS enabled (based on the policy list)
ALTER TABLE public.learning_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.learning_logs_backup ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.friendships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quest_collaborations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quest_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leaderboards ENABLE ROW LEVEL SECURITY;

-- =============================================
-- PART 2: CREATE POLICIES FOR UNPROTECTED TABLES
-- =============================================

-- Policies for learning_logs (has user_id and user_quest_id columns)
CREATE POLICY "Users can view own learning logs" ON public.learning_logs
  FOR SELECT USING (user_id = (SELECT auth.uid()));

CREATE POLICY "Users can create own learning logs" ON public.learning_logs
  FOR INSERT WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY "Users can update own learning logs" ON public.learning_logs
  FOR UPDATE USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY "Users can delete own learning logs" ON public.learning_logs
  FOR DELETE USING (user_id = (SELECT auth.uid()));

-- Policies for learning_logs_backup (admin only)
CREATE POLICY "Admins can manage learning_logs_backup" ON public.learning_logs_backup
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = (SELECT auth.uid())
      AND users.role = 'admin'
    )
  );

-- Policies for submissions (has user_quest_id, educator_id columns)
CREATE POLICY "Users can view own submissions" ON public.submissions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.user_quests
      WHERE user_quests.id = submissions.user_quest_id
      AND user_quests.user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "Users can create own submissions" ON public.submissions
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_quests
      WHERE user_quests.id = submissions.user_quest_id
      AND user_quests.user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "Users can update own submissions" ON public.submissions
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.user_quests
      WHERE user_quests.id = submissions.user_quest_id
      AND user_quests.user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "Educators can review submissions" ON public.submissions
  FOR ALL USING (educator_id = (SELECT auth.uid()));

CREATE POLICY "Admins can manage all submissions" ON public.submissions
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = (SELECT auth.uid())
      AND users.role = 'admin'
    )
  );

-- Policies for friendships (has requester_id, addressee_id columns)
CREATE POLICY "Users can view own friendships" ON public.friendships
  FOR SELECT USING (
    requester_id = (SELECT auth.uid()) OR addressee_id = (SELECT auth.uid())
  );

CREATE POLICY "Users can create friendships" ON public.friendships
  FOR INSERT WITH CHECK (requester_id = (SELECT auth.uid()));

CREATE POLICY "Users can update own friendships" ON public.friendships
  FOR UPDATE USING (
    requester_id = (SELECT auth.uid()) OR addressee_id = (SELECT auth.uid())
  );

CREATE POLICY "Users can delete own friendships" ON public.friendships
  FOR DELETE USING (
    requester_id = (SELECT auth.uid()) OR addressee_id = (SELECT auth.uid())
  );

-- Policies for quest_collaborations (has requester_id, partner_id columns)
CREATE POLICY "Users can view own collaborations" ON public.quest_collaborations
  FOR SELECT USING (
    requester_id = (SELECT auth.uid()) OR partner_id = (SELECT auth.uid())
  );

CREATE POLICY "Users can create collaborations" ON public.quest_collaborations
  FOR INSERT WITH CHECK (requester_id = (SELECT auth.uid()));

CREATE POLICY "Users can update own collaborations" ON public.quest_collaborations
  FOR UPDATE USING (
    requester_id = (SELECT auth.uid()) OR partner_id = (SELECT auth.uid())
  );

CREATE POLICY "Admins can manage all collaborations" ON public.quest_collaborations
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = (SELECT auth.uid())
      AND users.role = 'admin'
    )
  );

-- Policies for quest_reviews (has reviewer_id column)
CREATE POLICY "Users can view all quest reviews" ON public.quest_reviews
  FOR SELECT USING (true);

CREATE POLICY "Users can create own quest reviews" ON public.quest_reviews
  FOR INSERT WITH CHECK (reviewer_id = (SELECT auth.uid()));

CREATE POLICY "Users can update own quest reviews" ON public.quest_reviews
  FOR UPDATE USING (reviewer_id = (SELECT auth.uid()));

CREATE POLICY "Users can delete own quest reviews" ON public.quest_reviews
  FOR DELETE USING (reviewer_id = (SELECT auth.uid()));

-- Policies for user_achievements (has user_id column)
CREATE POLICY "Users can view own achievements" ON public.user_achievements
  FOR SELECT USING (user_id = (SELECT auth.uid()));

CREATE POLICY "Public can view achievements for public profiles" ON public.user_achievements
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.diplomas
      WHERE diplomas.user_id = user_achievements.user_id
      AND diplomas.is_public = true
    )
  );

CREATE POLICY "System can create achievements" ON public.user_achievements
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = (SELECT auth.uid())
      AND users.role = 'admin'
    )
  );

-- Policies for leaderboards (has user_id column)
CREATE POLICY "Public can view leaderboards" ON public.leaderboards
  FOR SELECT USING (true);

CREATE POLICY "Admins can manage leaderboards" ON public.leaderboards
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = (SELECT auth.uid())
      AND users.role = 'admin'
    )
  );

-- =============================================
-- PART 3: FIX EXISTING POLICY PERFORMANCE ISSUES
-- =============================================

-- Fix activity_log policies
DROP POLICY IF EXISTS "Users can view own activity" ON public.activity_log;
CREATE POLICY "Users can view own activity" ON public.activity_log
  FOR SELECT USING (user_id = (SELECT auth.uid()));

-- Fix advisor_group_members policies
DROP POLICY IF EXISTS "Students can view their group memberships" ON public.advisor_group_members;
CREATE POLICY "Students can view their group memberships" ON public.advisor_group_members
  FOR SELECT USING (student_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Advisors can manage their group members" ON public.advisor_group_members;
CREATE POLICY "Advisors can manage their group members" ON public.advisor_group_members
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.advisor_groups
      WHERE advisor_groups.id = advisor_group_members.group_id
      AND advisor_groups.advisor_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Admins can manage all memberships" ON public.advisor_group_members;
CREATE POLICY "Admins can manage all memberships" ON public.advisor_group_members
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

-- Fix diplomas policies
DROP POLICY IF EXISTS "Diplomas viewable by owner or if public" ON public.diplomas;
CREATE POLICY "Diplomas viewable by owner or if public" ON public.diplomas
  FOR SELECT USING (
    user_id = (SELECT auth.uid()) OR is_public = true
  );

DROP POLICY IF EXISTS "Diplomas updatable by owner" ON public.diplomas;
CREATE POLICY "Diplomas updatable by owner" ON public.diplomas
  FOR UPDATE USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Users can view own diploma" ON public.diplomas;
CREATE POLICY "Users can view own diploma" ON public.diplomas
  FOR SELECT USING (user_id = (SELECT auth.uid()));

-- Fix parent_child_relationships policies
DROP POLICY IF EXISTS "Parents can view their relationships" ON public.parent_child_relationships;
CREATE POLICY "Parents can view their relationships" ON public.parent_child_relationships
  FOR SELECT USING (parent_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Children can view their parent relationships" ON public.parent_child_relationships;
CREATE POLICY "Children can view their parent relationships" ON public.parent_child_relationships
  FOR SELECT USING (child_id = (SELECT auth.uid()) AND status = 'approved');

DROP POLICY IF EXISTS "Admins can manage all relationships" ON public.parent_child_relationships;
CREATE POLICY "Admins can manage all relationships" ON public.parent_child_relationships
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

-- Fix user_quest_tasks policies
DROP POLICY IF EXISTS "Users can view own task completions" ON public.user_quest_tasks;
CREATE POLICY "Users can view own task completions" ON public.user_quest_tasks
  FOR SELECT USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Users can complete tasks" ON public.user_quest_tasks;
CREATE POLICY "Users can complete tasks" ON public.user_quest_tasks
  FOR INSERT WITH CHECK (user_id = (SELECT auth.uid()));

-- Fix user_quests policies
DROP POLICY IF EXISTS "Users can view own quest enrollments" ON public.user_quests;
CREATE POLICY "Users can view own quest enrollments" ON public.user_quests
  FOR SELECT USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Users can enroll in quests" ON public.user_quests;
CREATE POLICY "Users can enroll in quests" ON public.user_quests
  FOR INSERT WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Users can update own quest progress" ON public.user_quests;
CREATE POLICY "Users can update own quest progress" ON public.user_quests
  FOR UPDATE USING (user_id = (SELECT auth.uid()));

-- Fix user_skill_details policies
DROP POLICY IF EXISTS "Users can view their own skill details" ON public.user_skill_details;
CREATE POLICY "Users can view their own skill details" ON public.user_skill_details
  FOR SELECT USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Service role can manage skill details" ON public.user_skill_details;
CREATE POLICY "Service role can manage skill details" ON public.user_skill_details
  FOR ALL USING (
    (SELECT current_setting('request.jwt.claims', true)::json->>'role') = 'service_role'
  );

-- Fix user_skill_xp policies
DROP POLICY IF EXISTS "Users can view own XP" ON public.user_skill_xp;
CREATE POLICY "Users can view own XP" ON public.user_skill_xp
  FOR SELECT USING (user_id = (SELECT auth.uid()));

-- Fix user_xp policies
DROP POLICY IF EXISTS "Users can view their own XP" ON public.user_xp;
CREATE POLICY "Users can view their own XP" ON public.user_xp
  FOR SELECT USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Service role can manage all XP" ON public.user_xp;
CREATE POLICY "Service role can manage all XP" ON public.user_xp
  FOR ALL USING (
    (SELECT current_setting('request.jwt.claims', true)::json->>'role') = 'service_role'
  );

-- Fix users policies
DROP POLICY IF EXISTS "Users can view own profile" ON public.users;
CREATE POLICY "Users can view own profile" ON public.users
  FOR SELECT USING (id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Users can update own profile" ON public.users;
CREATE POLICY "Users can update own profile" ON public.users
  FOR UPDATE USING (id = (SELECT auth.uid()));

-- Fix site_settings policies (replace incorrect auth.jwt() with proper check)
DROP POLICY IF EXISTS "Admins can manage site settings" ON public.site_settings;
CREATE POLICY "Admins can manage site settings" ON public.site_settings
  FOR ALL USING (
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