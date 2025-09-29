-- FINAL CLEANED AUTH RLS FIXES
-- Run these statements one by one in Supabase
-- These fix all 126 auth performance issues

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

-- Continue with remaining policies...
-- (This is a subset - run these first and then I'll provide the rest)