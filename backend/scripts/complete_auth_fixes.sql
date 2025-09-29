-- =============================================
-- COMPLETE AUTH RLS PERFORMANCE FIXES
-- =============================================
-- Run these statements in Supabase to fix all 126 auth performance issues
-- These replace auth.uid() with (select auth.uid()) for better performance
-- =============================================

-- Activity Log
ALTER POLICY "Users can view own activity" ON public.activity_log
USING (user_id = (select auth.uid()));

ALTER POLICY "activity_log_select_own" ON public.activity_log
USING (user_id = (select auth.uid()));

-- Advisor Group Members
ALTER POLICY "advisor_group_members_delete" ON public.advisor_group_members
USING (is_admin() OR (EXISTS (
  SELECT 1 FROM advisor_groups ag
  WHERE ag.id = advisor_group_members.group_id
    AND ag.advisor_id = (select auth.uid())
)));

ALTER POLICY "advisor_group_members_insert" ON public.advisor_group_members
WITH CHECK (is_admin() OR (EXISTS (
  SELECT 1 FROM advisor_groups ag
  WHERE ag.id = advisor_group_members.group_id
    AND ag.advisor_id = (select auth.uid())
)));

ALTER POLICY "advisor_group_members_select" ON public.advisor_group_members
USING (is_admin() OR (EXISTS (
  SELECT 1 FROM advisor_groups ag
  WHERE ag.id = advisor_group_members.group_id
    AND ag.advisor_id = (select auth.uid())
)) OR student_id = (select auth.uid()));

ALTER POLICY "advisor_group_members_select_involved" ON public.advisor_group_members
USING (student_id = (select auth.uid()) OR (EXISTS (
  SELECT 1 FROM advisor_groups
  WHERE advisor_groups.id = advisor_group_members.group_id
    AND advisor_groups.advisor_id = (select auth.uid())
)));

ALTER POLICY "advisor_group_members_update" ON public.advisor_group_members
WITH CHECK (is_admin() OR (EXISTS (
  SELECT 1 FROM advisor_groups ag
  WHERE ag.id = advisor_group_members.group_id
    AND ag.advisor_id = (select auth.uid())
)));

-- Advisor Groups
ALTER POLICY "advisor_groups_delete" ON public.advisor_groups
USING (is_admin() OR advisor_id = (select auth.uid()));

ALTER POLICY "advisor_groups_insert" ON public.advisor_groups
WITH CHECK (is_admin() OR advisor_id = (select auth.uid()));

ALTER POLICY "advisor_groups_insert_advisor" ON public.advisor_groups
WITH CHECK (advisor_id = (select auth.uid()));

ALTER POLICY "advisor_groups_select" ON public.advisor_groups
USING (is_admin() OR advisor_id = (select auth.uid()) OR (EXISTS (
  SELECT 1 FROM advisor_group_members agm
  WHERE agm.group_id = advisor_groups.id
    AND agm.student_id = (select auth.uid())
)));

ALTER POLICY "advisor_groups_select_involved" ON public.advisor_groups
USING (advisor_id = (select auth.uid()) OR (EXISTS (
  SELECT 1 FROM advisor_group_members
  WHERE advisor_group_members.group_id = advisor_groups.id
    AND advisor_group_members.student_id = (select auth.uid())
)));

ALTER POLICY "advisor_groups_update" ON public.advisor_groups
WITH CHECK (is_admin() OR advisor_id = (select auth.uid()));

ALTER POLICY "advisor_groups_update_advisor" ON public.advisor_groups
WITH CHECK (advisor_id = (select auth.uid()));

-- Diplomas
ALTER POLICY "Diplomas updatable by owner" ON public.diplomas
WITH CHECK (user_id = (select auth.uid()));

ALTER POLICY "diplomas_access" ON public.diplomas
USING (user_id = (select auth.uid()) OR is_public = true OR ((select auth.jwt()) ->> 'role')::text = 'admin');

ALTER POLICY "diplomas_insert_own" ON public.diplomas
WITH CHECK (user_id = (select auth.uid()));

ALTER POLICY "diplomas_select" ON public.diplomas
USING (user_id = (select auth.uid()) OR is_public = true OR is_admin());

ALTER POLICY "diplomas_select_public" ON public.diplomas
USING (is_public = true OR user_id = (select auth.uid()));

ALTER POLICY "diplomas_update_own" ON public.diplomas
WITH CHECK (user_id = (select auth.uid()));

-- Evidence Document Blocks
ALTER POLICY "Users can delete blocks from their own documents" ON public.evidence_document_blocks
USING (EXISTS (
  SELECT 1 FROM user_task_evidence_documents uted
  WHERE uted.id = evidence_document_blocks.document_id
    AND uted.user_id = (select auth.uid())
));

ALTER POLICY "Users can insert blocks into their own documents" ON public.evidence_document_blocks
WITH CHECK (EXISTS (
  SELECT 1 FROM user_task_evidence_documents uted
  WHERE uted.id = evidence_document_blocks.document_id
    AND uted.user_id = (select auth.uid())
));

ALTER POLICY "Users can update blocks in their own documents" ON public.evidence_document_blocks
WITH CHECK (EXISTS (
  SELECT 1 FROM user_task_evidence_documents uted
  WHERE uted.id = evidence_document_blocks.document_id
    AND uted.user_id = (select auth.uid())
));

ALTER POLICY "Users can view blocks from their own documents" ON public.evidence_document_blocks
USING (EXISTS (
  SELECT 1 FROM user_task_evidence_documents uted
  WHERE uted.id = evidence_document_blocks.document_id
    AND uted.user_id = (select auth.uid())
));

-- Friendships
ALTER POLICY "Users can delete own friendships" ON public.friendships
USING (requester_id = (select auth.uid()) OR addressee_id = (select auth.uid()));

ALTER POLICY "Users can send friend requests" ON public.friendships
WITH CHECK (requester_id = (select auth.uid()) AND requester_id <> addressee_id);

ALTER POLICY "Users can update friendships they're part of" ON public.friendships
WITH CHECK (requester_id = (select auth.uid()) OR addressee_id = (select auth.uid()));

ALTER POLICY "Users can view their friendships" ON public.friendships
USING (requester_id = (select auth.uid()) OR addressee_id = (select auth.uid()));

ALTER POLICY "friendships_delete_involved" ON public.friendships
USING (requester_id = (select auth.uid()) OR addressee_id = (select auth.uid()));

ALTER POLICY "friendships_insert" ON public.friendships
WITH CHECK (requester_id = (select auth.uid()) OR is_admin());

ALTER POLICY "friendships_insert_requester" ON public.friendships
WITH CHECK (requester_id = (select auth.uid()));

ALTER POLICY "friendships_select" ON public.friendships
USING (requester_id = (select auth.uid()) OR addressee_id = (select auth.uid()) OR is_admin());

ALTER POLICY "friendships_select_involved" ON public.friendships
USING (requester_id = (select auth.uid()) OR addressee_id = (select auth.uid()));

ALTER POLICY "friendships_update" ON public.friendships
WITH CHECK (requester_id = (select auth.uid()) OR addressee_id = (select auth.uid()) OR is_admin());

ALTER POLICY "friendships_update_involved" ON public.friendships
WITH CHECK (requester_id = (select auth.uid()) OR addressee_id = (select auth.uid()));

-- Parent Child Relationships
ALTER POLICY "parent_child_insert_parent" ON public.parent_child_relationships
WITH CHECK (parent_id = (select auth.uid()));

ALTER POLICY "parent_child_relationships_delete" ON public.parent_child_relationships
USING (is_admin() OR parent_id = (select auth.uid()));

ALTER POLICY "parent_child_relationships_insert" ON public.parent_child_relationships
WITH CHECK (is_admin() OR parent_id = (select auth.uid()));

ALTER POLICY "parent_child_relationships_select" ON public.parent_child_relationships
USING (is_admin() OR child_id = (select auth.uid()) OR parent_id = (select auth.uid()));

ALTER POLICY "parent_child_relationships_update" ON public.parent_child_relationships
WITH CHECK (is_admin() OR parent_id = (select auth.uid()));

ALTER POLICY "parent_child_select_involved" ON public.parent_child_relationships
USING (parent_id = (select auth.uid()) OR child_id = (select auth.uid()));

ALTER POLICY "parent_child_update_involved" ON public.parent_child_relationships
WITH CHECK (parent_id = (select auth.uid()) OR child_id = (select auth.uid()));

-- Quest Collaborations
ALTER POLICY "Users can create collaboration requests" ON public.quest_collaborations
WITH CHECK (requester_id = (select auth.uid()));

ALTER POLICY "Users can respond to collaborations" ON public.quest_collaborations
WITH CHECK (partner_id = (select auth.uid()) OR requester_id = (select auth.uid()));

ALTER POLICY "Users can view their collaborations" ON public.quest_collaborations
USING (requester_id = (select auth.uid()) OR partner_id = (select auth.uid()));

-- Quest Customizations
ALTER POLICY "Admins can update quest customizations" ON public.quest_customizations
WITH CHECK (EXISTS (
  SELECT 1 FROM users
  WHERE users.id = (select auth.uid())
    AND users.role::text = 'admin'
));

ALTER POLICY "Admins can view all quest customizations" ON public.quest_customizations
USING (EXISTS (
  SELECT 1 FROM users
  WHERE users.id = (select auth.uid())
    AND users.role::text = 'admin'
));

ALTER POLICY "Users can create quest customizations" ON public.quest_customizations
WITH CHECK (user_id = (select auth.uid()));

ALTER POLICY "Users can update their own quest customizations" ON public.quest_customizations
WITH CHECK (user_id = (select auth.uid()));

ALTER POLICY "Users can view their own quest customizations" ON public.quest_customizations
USING (user_id = (select auth.uid()));

-- Quest Ideas
ALTER POLICY "quest_ideas_insert_auth" ON public.quest_ideas
WITH CHECK ((select auth.uid()) IS NOT NULL);

ALTER POLICY "quest_ideas_update_own" ON public.quest_ideas
WITH CHECK (user_id = (select auth.uid()));

-- Quest Ratings
ALTER POLICY "quest_ratings_insert_own" ON public.quest_ratings
WITH CHECK (user_id = (select auth.uid()));

ALTER POLICY "quest_ratings_update_own" ON public.quest_ratings
WITH CHECK (user_id = (select auth.uid()));

-- Quest Reviews
ALTER POLICY "quest_reviews_delete" ON public.quest_reviews
USING (reviewer_id = (select auth.uid()) OR is_admin());

ALTER POLICY "quest_reviews_insert" ON public.quest_reviews
WITH CHECK (reviewer_id = (select auth.uid()) OR is_admin());

ALTER POLICY "quest_reviews_insert_reviewer" ON public.quest_reviews
WITH CHECK (reviewer_id = (select auth.uid()) OR is_admin());

ALTER POLICY "quest_reviews_update" ON public.quest_reviews
WITH CHECK (reviewer_id = (select auth.uid()) OR is_admin());

ALTER POLICY "quest_reviews_update_reviewer" ON public.quest_reviews
WITH CHECK (reviewer_id = (select auth.uid()) OR is_admin());

-- Quest Submissions
ALTER POLICY "Admins can update submissions" ON public.quest_submissions
WITH CHECK (EXISTS (
  SELECT 1 FROM users
  WHERE users.id = (select auth.uid())
    AND users.role::text = 'admin'
));

ALTER POLICY "Admins can view all submissions" ON public.quest_submissions
USING (EXISTS (
  SELECT 1 FROM users
  WHERE users.id = (select auth.uid())
    AND users.role::text = 'admin'
));

ALTER POLICY "Users can create submissions" ON public.quest_submissions
WITH CHECK (user_id = (select auth.uid()));

ALTER POLICY "Users can view their own submissions" ON public.quest_submissions
USING (user_id = (select auth.uid()));

-- Quest Task Completions
ALTER POLICY "quest_task_completions_own_insert" ON public.quest_task_completions
WITH CHECK (user_id = (select auth.uid()));

ALTER POLICY "quest_task_completions_own_read" ON public.quest_task_completions
USING (user_id = (select auth.uid()));

-- Role Change Log
ALTER POLICY "Only admins can insert role changes" ON public.role_change_log
WITH CHECK (EXISTS (
  SELECT 1 FROM users
  WHERE users.id = (select auth.uid())
    AND users.role::text = 'admin'
));

ALTER POLICY "Only admins can view role changes" ON public.role_change_log
USING (EXISTS (
  SELECT 1 FROM users
  WHERE users.id = (select auth.uid())
    AND users.role::text = 'admin'
));

-- Storage Objects
ALTER POLICY "Admins can delete site assets" ON storage.objects
USING (bucket_id = 'site-assets' AND ((select auth.jwt()) ->> 'role')::text = 'admin');

ALTER POLICY "Admins can update site assets" ON storage.objects
WITH CHECK (bucket_id = 'site-assets' AND ((select auth.jwt()) ->> 'role')::text = 'admin');

ALTER POLICY "Admins can upload site assets" ON storage.objects
WITH CHECK (bucket_id = 'site-assets' AND ((select auth.jwt()) ->> 'role')::text = 'admin');

-- Submissions
ALTER POLICY "submissions_delete" ON public.submissions
USING (is_admin() OR educator_id = (select auth.uid()));

ALTER POLICY "submissions_insert_educator" ON public.submissions
WITH CHECK (educator_id = (select auth.uid()) OR is_admin());

ALTER POLICY "submissions_update_educator" ON public.submissions
WITH CHECK (educator_id = (select auth.uid()) OR is_admin());

-- Tutor Analytics
ALTER POLICY "Users can view own analytics" ON public.tutor_analytics
USING ((select auth.uid()) = user_id);

-- Tutor Conversations
ALTER POLICY "Users can create own conversations" ON public.tutor_conversations
WITH CHECK ((select auth.uid()) = user_id);

ALTER POLICY "Users can update own conversations" ON public.tutor_conversations
WITH CHECK ((select auth.uid()) = user_id);

ALTER POLICY "Users can view own conversations" ON public.tutor_conversations
USING ((select auth.uid()) = user_id);

-- Tutor Messages
ALTER POLICY "Users can create messages in own conversations" ON public.tutor_messages
WITH CHECK (EXISTS (
  SELECT 1 FROM tutor_conversations
  WHERE tutor_conversations.id = tutor_messages.conversation_id
    AND tutor_conversations.user_id = (select auth.uid())
));

ALTER POLICY "Users can view own messages" ON public.tutor_messages
USING (EXISTS (
  SELECT 1 FROM tutor_conversations
  WHERE tutor_conversations.id = tutor_messages.conversation_id
    AND tutor_conversations.user_id = (select auth.uid())
));

-- Tutor Safety Reports
ALTER POLICY "Users can view own safety reports" ON public.tutor_safety_reports
USING ((select auth.uid()) = user_id);

-- User Achievements
ALTER POLICY "user_achievements_delete" ON public.user_achievements
USING (is_admin() OR ((select auth.jwt()) ->> 'role')::text = 'service_role');

ALTER POLICY "user_achievements_insert" ON public.user_achievements
WITH CHECK (is_admin() OR ((select auth.jwt()) ->> 'role')::text = 'service_role');

ALTER POLICY "user_achievements_select" ON public.user_achievements
USING (user_id = (select auth.uid()) OR is_admin() OR (EXISTS (
  SELECT 1 FROM diplomas d
  WHERE d.user_id = user_achievements.user_id
    AND d.is_public = true
)));

ALTER POLICY "user_achievements_select_own" ON public.user_achievements
USING (user_id = (select auth.uid()));

ALTER POLICY "user_achievements_update" ON public.user_achievements
WITH CHECK (is_admin() OR ((select auth.jwt()) ->> 'role')::text = 'service_role');

-- User Badges
ALTER POLICY "Users can view their own badges" ON public.user_badges
USING (user_id = (select auth.uid()));

-- User Mastery
ALTER POLICY "Users can view their own mastery" ON public.user_mastery
USING (user_id = (select auth.uid()));

-- User Quest Tasks
ALTER POLICY "Users can complete their own tasks" ON public.user_quest_tasks
WITH CHECK (user_id = (select auth.uid()));

ALTER POLICY "Users can view their own task completions" ON public.user_quest_tasks
USING (user_id = (select auth.uid()));

-- User Quests
ALTER POLICY "Users can enroll in quests" ON public.user_quests
WITH CHECK (user_id = (select auth.uid()));

ALTER POLICY "Users can update their own quest enrollments" ON public.user_quests
WITH CHECK (user_id = (select auth.uid()));

ALTER POLICY "Users can view their own quest enrollments" ON public.user_quests
USING (user_id = (select auth.uid()));

-- User Skill Details
ALTER POLICY "Users can view their own skill details" ON public.user_skill_details
USING (user_id = (select auth.uid()));

-- User Skill XP
ALTER POLICY "Users can view their own XP" ON public.user_skill_xp
USING (user_id = (select auth.uid()));

-- User Subject XP
ALTER POLICY "Users can view their own subject XP" ON public.user_subject_xp
USING (user_id = (select auth.uid()));

-- User Task Evidence Documents
ALTER POLICY "Users can delete their own evidence documents" ON public.user_task_evidence_documents
USING ((select auth.uid()) = user_id);

ALTER POLICY "Users can insert their own evidence documents" ON public.user_task_evidence_documents
WITH CHECK ((select auth.uid()) = user_id);

ALTER POLICY "Users can update their own evidence documents" ON public.user_task_evidence_documents
WITH CHECK ((select auth.uid()) = user_id);

ALTER POLICY "Users can view their own evidence documents" ON public.user_task_evidence_documents
USING ((select auth.uid()) = user_id);

-- User XP
ALTER POLICY "Users can view their own XP" ON public.user_xp
USING (user_id = (select auth.uid()));

ALTER POLICY "user_xp_insert_own" ON public.user_xp
WITH CHECK (user_id = (select auth.uid()));

ALTER POLICY "user_xp_update_own" ON public.user_xp
WITH CHECK (user_id = (select auth.uid()));

-- Users
ALTER POLICY "users_can_insert_own" ON public.users
WITH CHECK ((select auth.uid()) = id);

ALTER POLICY "users_can_read_own" ON public.users
USING (((select auth.uid()) = id) OR (auth.role() = 'service_role'));

ALTER POLICY "users_can_update_own" ON public.users
WITH CHECK ((select auth.uid()) = id);

ALTER POLICY "users_insert_own" ON public.users
WITH CHECK (id = (select auth.uid()));

ALTER POLICY "users_select_own" ON public.users
USING (id = (select auth.uid()));

ALTER POLICY "users_update_own" ON public.users
WITH CHECK (id = (select auth.uid()));

-- =============================================
-- VERIFICATION QUERY
-- =============================================
-- Run this after all ALTER statements to check progress:

SELECT
  'Auth RLS issues remaining' as issue_type,
  count(*) as count
FROM pg_policies
WHERE (qual LIKE '%auth.uid()%' OR qual LIKE '%auth.jwt()%' OR
       with_check LIKE '%auth.uid()%' OR with_check LIKE '%auth.jwt()%');