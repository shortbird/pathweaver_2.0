-- Migration: Fix RLS Performance Part 3 - All Remaining Policies
-- Purpose: Wrap auth.uid() calls in (select auth.uid()) to evaluate once per query
-- Date: 2026-01-12
-- Fixes: 73 remaining policies identified by Supabase linter

-- =============================================================================
-- HIGH-TRAFFIC TABLES (fix these first for biggest impact)
-- =============================================================================

-- user_quest_tasks (3 policies) - HIGH TRAFFIC
DROP POLICY IF EXISTS "Users can view their own tasks" ON public.user_quest_tasks;
CREATE POLICY "Users can view their own tasks" ON public.user_quest_tasks
FOR SELECT USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can insert their own tasks" ON public.user_quest_tasks;
CREATE POLICY "Users can insert their own tasks" ON public.user_quest_tasks
FOR INSERT WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can update their own tasks" ON public.user_quest_tasks;
CREATE POLICY "Users can update their own tasks" ON public.user_quest_tasks
FOR UPDATE USING ((select auth.uid()) = user_id);

-- user_quest_deadlines (4 policies) - HIGH TRAFFIC
DROP POLICY IF EXISTS "Users can view their own deadlines" ON public.user_quest_deadlines;
CREATE POLICY "Users can view their own deadlines" ON public.user_quest_deadlines
FOR SELECT USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can insert their own deadlines" ON public.user_quest_deadlines;
CREATE POLICY "Users can insert their own deadlines" ON public.user_quest_deadlines
FOR INSERT WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can update their own deadlines" ON public.user_quest_deadlines;
CREATE POLICY "Users can update their own deadlines" ON public.user_quest_deadlines
FOR UPDATE USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can delete their own deadlines" ON public.user_quest_deadlines;
CREATE POLICY "Users can delete their own deadlines" ON public.user_quest_deadlines
FOR DELETE USING ((select auth.uid()) = user_id);

-- users table (4 parent policies)
DROP POLICY IF EXISTS "parent_view_dependents" ON public.users;
CREATE POLICY "parent_view_dependents" ON public.users
FOR SELECT USING (managed_by_parent_id = (select auth.uid()));

DROP POLICY IF EXISTS "parent_create_dependents" ON public.users;
CREATE POLICY "parent_create_dependents" ON public.users
FOR INSERT WITH CHECK ((is_dependent = true) AND (managed_by_parent_id = (select auth.uid())));

DROP POLICY IF EXISTS "parent_update_dependents" ON public.users;
CREATE POLICY "parent_update_dependents" ON public.users
FOR UPDATE
USING (managed_by_parent_id = (select auth.uid()))
WITH CHECK (managed_by_parent_id = (select auth.uid()));

DROP POLICY IF EXISTS "parent_delete_dependents" ON public.users;
CREATE POLICY "parent_delete_dependents" ON public.users
FOR DELETE USING (managed_by_parent_id = (select auth.uid()));

-- =============================================================================
-- quest_invitations (6 policies)
-- =============================================================================

DROP POLICY IF EXISTS "Students can view their own quest invitations" ON public.quest_invitations;
CREATE POLICY "Students can view their own quest invitations" ON public.quest_invitations
FOR SELECT USING ((select auth.uid()) = student_id);

DROP POLICY IF EXISTS "Students can update their quest invitations" ON public.quest_invitations;
CREATE POLICY "Students can update their quest invitations" ON public.quest_invitations
FOR UPDATE
USING ((select auth.uid()) = student_id)
WITH CHECK (((select auth.uid()) = student_id) AND (status = ANY (ARRAY['accepted'::text, 'declined'::text])));

DROP POLICY IF EXISTS "Advisors can view their own quest invitations" ON public.quest_invitations;
CREATE POLICY "Advisors can view their own quest invitations" ON public.quest_invitations
FOR SELECT USING (
    ((select auth.uid()) = advisor_id) AND (EXISTS (
        SELECT 1 FROM users
        WHERE users.id = (select auth.uid())
        AND users.organization_id = quest_invitations.organization_id
        AND users.role::text = ANY(ARRAY['advisor', 'school_admin', 'superadmin', 'admin', 'educator'])
    ))
);

DROP POLICY IF EXISTS "Advisors can create quest invitations" ON public.quest_invitations;
CREATE POLICY "Advisors can create quest invitations" ON public.quest_invitations
FOR INSERT WITH CHECK (
    ((select auth.uid()) = advisor_id) AND (EXISTS (
        SELECT 1 FROM users
        WHERE users.id = (select auth.uid())
        AND users.organization_id = quest_invitations.organization_id
        AND users.role::text = ANY(ARRAY['advisor', 'school_admin', 'superadmin', 'admin', 'educator'])
    ))
);

DROP POLICY IF EXISTS "Advisors can update their quest invitations" ON public.quest_invitations;
CREATE POLICY "Advisors can update their quest invitations" ON public.quest_invitations
FOR UPDATE
USING ((select auth.uid()) = advisor_id)
WITH CHECK ((select auth.uid()) = advisor_id);

DROP POLICY IF EXISTS "Advisors can delete their quest invitations" ON public.quest_invitations;
CREATE POLICY "Advisors can delete their quest invitations" ON public.quest_invitations
FOR DELETE USING ((select auth.uid()) = advisor_id);

-- =============================================================================
-- org_invitations (5 policies)
-- =============================================================================

DROP POLICY IF EXISTS "Org admins can view org invitations" ON public.org_invitations;
CREATE POLICY "Org admins can view org invitations" ON public.org_invitations
FOR SELECT USING (EXISTS (
    SELECT 1 FROM users
    WHERE users.id = (select auth.uid())
    AND users.organization_id = org_invitations.organization_id
    AND users.role::text = ANY(ARRAY['org_admin', 'superadmin'])
));

DROP POLICY IF EXISTS "Superadmins can view all org invitations" ON public.org_invitations;
CREATE POLICY "Superadmins can view all org invitations" ON public.org_invitations
FOR SELECT USING (EXISTS (
    SELECT 1 FROM users
    WHERE users.id = (select auth.uid()) AND users.role::text = 'superadmin'
));

DROP POLICY IF EXISTS "Org admins can create org invitations" ON public.org_invitations;
CREATE POLICY "Org admins can create org invitations" ON public.org_invitations
FOR INSERT WITH CHECK (
    ((select auth.uid()) = invited_by) AND (EXISTS (
        SELECT 1 FROM users
        WHERE users.id = (select auth.uid())
        AND users.organization_id = org_invitations.organization_id
        AND users.role::text = ANY(ARRAY['org_admin', 'superadmin'])
    ))
);

DROP POLICY IF EXISTS "Org admins can update org invitations" ON public.org_invitations;
CREATE POLICY "Org admins can update org invitations" ON public.org_invitations
FOR UPDATE USING (EXISTS (
    SELECT 1 FROM users
    WHERE users.id = (select auth.uid())
    AND users.organization_id = org_invitations.organization_id
    AND users.role::text = ANY(ARRAY['org_admin', 'superadmin'])
));

DROP POLICY IF EXISTS "Org admins can delete org invitations" ON public.org_invitations;
CREATE POLICY "Org admins can delete org invitations" ON public.org_invitations
FOR DELETE USING (EXISTS (
    SELECT 1 FROM users
    WHERE users.id = (select auth.uid())
    AND users.organization_id = org_invitations.organization_id
    AND users.role::text = ANY(ARRAY['org_admin', 'superadmin'])
));

-- =============================================================================
-- observer_access_audit (4 policies)
-- =============================================================================

DROP POLICY IF EXISTS "observer_view_own_audit_logs" ON public.observer_access_audit;
CREATE POLICY "observer_view_own_audit_logs" ON public.observer_access_audit
FOR SELECT USING (observer_id = (select auth.uid()));

DROP POLICY IF EXISTS "student_view_own_audit_logs" ON public.observer_access_audit;
CREATE POLICY "student_view_own_audit_logs" ON public.observer_access_audit
FOR SELECT USING (student_id = (select auth.uid()));

DROP POLICY IF EXISTS "admin_view_all_audit_logs" ON public.observer_access_audit;
CREATE POLICY "admin_view_all_audit_logs" ON public.observer_access_audit
FOR SELECT USING (EXISTS (
    SELECT 1 FROM users
    WHERE users.id = (select auth.uid())
    AND users.role::text = ANY(ARRAY['admin', 'superadmin'])
));

DROP POLICY IF EXISTS "admin_insert_audit_logs" ON public.observer_access_audit;
CREATE POLICY "admin_insert_audit_logs" ON public.observer_access_audit
FOR INSERT WITH CHECK (
    (EXISTS (
        SELECT 1 FROM users
        WHERE users.id = (select auth.uid())
        AND users.role::text = ANY(ARRAY['admin', 'superadmin'])
    )) OR ((select auth.uid()) IS NULL)
);

-- =============================================================================
-- observer_requests (4 policies)
-- =============================================================================

DROP POLICY IF EXISTS "Users can view own observer requests" ON public.observer_requests;
CREATE POLICY "Users can view own observer requests" ON public.observer_requests
FOR SELECT USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can create own observer requests" ON public.observer_requests;
CREATE POLICY "Users can create own observer requests" ON public.observer_requests
FOR INSERT WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Admins can view all observer requests" ON public.observer_requests;
CREATE POLICY "Admins can view all observer requests" ON public.observer_requests
FOR SELECT USING (EXISTS (
    SELECT 1 FROM users
    WHERE users.id = (select auth.uid()) AND users.role::text = 'admin'
));

DROP POLICY IF EXISTS "Admins can update observer requests" ON public.observer_requests;
CREATE POLICY "Admins can update observer requests" ON public.observer_requests
FOR UPDATE USING (EXISTS (
    SELECT 1 FROM users
    WHERE users.id = (select auth.uid()) AND users.role::text = 'admin'
));

-- =============================================================================
-- public_visibility_requests (5 policies)
-- =============================================================================

DROP POLICY IF EXISTS "student_view_own_visibility_requests" ON public.public_visibility_requests;
CREATE POLICY "student_view_own_visibility_requests" ON public.public_visibility_requests
FOR SELECT USING (student_user_id = (select auth.uid()));

DROP POLICY IF EXISTS "parent_view_child_visibility_requests" ON public.public_visibility_requests;
CREATE POLICY "parent_view_child_visibility_requests" ON public.public_visibility_requests
FOR SELECT USING (parent_user_id = (select auth.uid()));

DROP POLICY IF EXISTS "parent_respond_to_visibility_requests" ON public.public_visibility_requests;
CREATE POLICY "parent_respond_to_visibility_requests" ON public.public_visibility_requests
FOR UPDATE
USING (parent_user_id = (select auth.uid()))
WITH CHECK (parent_user_id = (select auth.uid()));

DROP POLICY IF EXISTS "admin_view_all_visibility_requests" ON public.public_visibility_requests;
CREATE POLICY "admin_view_all_visibility_requests" ON public.public_visibility_requests
FOR SELECT USING (EXISTS (
    SELECT 1 FROM users
    WHERE users.id = (select auth.uid())
    AND users.role::text = ANY(ARRAY['superadmin', 'org_admin'])
));

DROP POLICY IF EXISTS "service_insert_visibility_requests" ON public.public_visibility_requests;
CREATE POLICY "service_insert_visibility_requests" ON public.public_visibility_requests
FOR INSERT WITH CHECK (((select auth.uid()) IS NULL) OR (student_user_id = (select auth.uid())));

-- =============================================================================
-- quests (3 policies)
-- =============================================================================

DROP POLICY IF EXISTS "users_can_create_quests" ON public.quests;
CREATE POLICY "users_can_create_quests" ON public.quests
FOR INSERT WITH CHECK (created_by = (select auth.uid()));

DROP POLICY IF EXISTS "users_can_update_own_quests" ON public.quests;
CREATE POLICY "users_can_update_own_quests" ON public.quests
FOR UPDATE
USING (created_by = (select auth.uid()))
WITH CHECK (created_by = (select auth.uid()));

DROP POLICY IF EXISTS "org_admins_can_update_org_quests" ON public.quests;
CREATE POLICY "org_admins_can_update_org_quests" ON public.quests
FOR UPDATE
USING (organization_id IN (
    SELECT users.organization_id FROM users
    WHERE users.id = (select auth.uid())
    AND (users.is_org_admin = true OR users.role::text = 'admin')
))
WITH CHECK (organization_id IN (
    SELECT users.organization_id FROM users
    WHERE users.id = (select auth.uid())
    AND (users.is_org_admin = true OR users.role::text = 'admin')
));

-- =============================================================================
-- organization_quest_access (2 policies)
-- =============================================================================

DROP POLICY IF EXISTS "users_can_view_org_quest_access" ON public.organization_quest_access;
CREATE POLICY "users_can_view_org_quest_access" ON public.organization_quest_access
FOR SELECT USING (
    organization_id IN (
        SELECT users.organization_id FROM users WHERE users.id = (select auth.uid())
    )
);

DROP POLICY IF EXISTS "org_admins_can_manage_quest_access" ON public.organization_quest_access;
CREATE POLICY "org_admins_can_manage_quest_access" ON public.organization_quest_access
FOR ALL USING (
    organization_id IN (
        SELECT users.organization_id FROM users
        WHERE users.id = (select auth.uid())
        AND (users.is_org_admin = true OR users.role::text = 'admin')
    )
);

-- =============================================================================
-- quest_collaborations (2 policies)
-- =============================================================================

DROP POLICY IF EXISTS "Users can view collaborations in their organization" ON public.quest_collaborations;
CREATE POLICY "Users can view collaborations in their organization" ON public.quest_collaborations
FOR SELECT USING (
    organization_id IN (
        SELECT users.organization_id FROM users WHERE users.id = (select auth.uid())
    )
);

DROP POLICY IF EXISTS "Users can create collaborations in their organization" ON public.quest_collaborations;
CREATE POLICY "Users can create collaborations in their organization" ON public.quest_collaborations
FOR INSERT WITH CHECK (
    organization_id IN (
        SELECT users.organization_id FROM users WHERE users.id = (select auth.uid())
    )
);

-- =============================================================================
-- quest_collaboration_members (2 policies)
-- =============================================================================

DROP POLICY IF EXISTS "Users can view collaboration members" ON public.quest_collaboration_members;
CREATE POLICY "Users can view collaboration members" ON public.quest_collaboration_members
FOR SELECT USING (
    collaboration_id IN (
        SELECT quest_collaborations.id FROM quest_collaborations
        WHERE quest_collaborations.organization_id IN (
            SELECT users.organization_id FROM users WHERE users.id = (select auth.uid())
        )
    )
);

DROP POLICY IF EXISTS "Users can join collaborations" ON public.quest_collaboration_members;
CREATE POLICY "Users can join collaborations" ON public.quest_collaboration_members
FOR INSERT WITH CHECK (user_id = (select auth.uid()));

-- =============================================================================
-- quest_task_flags (3 policies)
-- =============================================================================

DROP POLICY IF EXISTS "Users can view their own flags" ON public.quest_task_flags;
CREATE POLICY "Users can view their own flags" ON public.quest_task_flags
FOR SELECT USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can insert their own flags" ON public.quest_task_flags;
CREATE POLICY "Users can insert their own flags" ON public.quest_task_flags
FOR INSERT WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Admins can view all flags" ON public.quest_task_flags;
CREATE POLICY "Admins can view all flags" ON public.quest_task_flags
FOR SELECT USING (EXISTS (
    SELECT 1 FROM users
    WHERE users.id = (select auth.uid()) AND users.role::text = 'admin'
));

-- =============================================================================
-- quest_personalization_sessions (2 policies)
-- =============================================================================

DROP POLICY IF EXISTS "Users can create their own sessions" ON public.quest_personalization_sessions;
CREATE POLICY "Users can create their own sessions" ON public.quest_personalization_sessions
FOR INSERT WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can update their own sessions" ON public.quest_personalization_sessions;
CREATE POLICY "Users can update their own sessions" ON public.quest_personalization_sessions
FOR UPDATE USING ((select auth.uid()) = user_id);

-- =============================================================================
-- shared_evidence (2 policies)
-- =============================================================================

DROP POLICY IF EXISTS "Collaboration members can view shared evidence" ON public.shared_evidence;
CREATE POLICY "Collaboration members can view shared evidence" ON public.shared_evidence
FOR SELECT USING (
    collaboration_id IN (
        SELECT quest_collaboration_members.collaboration_id
        FROM quest_collaboration_members
        WHERE quest_collaboration_members.user_id = (select auth.uid())
    )
);

DROP POLICY IF EXISTS "Users can submit evidence to their collaborations" ON public.shared_evidence;
CREATE POLICY "Users can submit evidence to their collaborations" ON public.shared_evidence
FOR INSERT WITH CHECK (
    (submitted_by = (select auth.uid())) AND (collaboration_id IN (
        SELECT quest_collaboration_members.collaboration_id
        FROM quest_collaboration_members
        WHERE quest_collaboration_members.user_id = (select auth.uid())
    ))
);

-- =============================================================================
-- shared_evidence_approvals (2 policies)
-- =============================================================================

DROP POLICY IF EXISTS "Collaboration members can view approvals" ON public.shared_evidence_approvals;
CREATE POLICY "Collaboration members can view approvals" ON public.shared_evidence_approvals
FOR SELECT USING (
    shared_evidence_id IN (
        SELECT shared_evidence.id FROM shared_evidence
        WHERE shared_evidence.collaboration_id IN (
            SELECT quest_collaboration_members.collaboration_id
            FROM quest_collaboration_members
            WHERE quest_collaboration_members.user_id = (select auth.uid())
        )
    )
);

DROP POLICY IF EXISTS "Collaboration members can approve evidence" ON public.shared_evidence_approvals;
CREATE POLICY "Collaboration members can approve evidence" ON public.shared_evidence_approvals
FOR INSERT WITH CHECK (
    (user_id = (select auth.uid())) AND (shared_evidence_id IN (
        SELECT shared_evidence.id FROM shared_evidence
        WHERE shared_evidence.collaboration_id IN (
            SELECT quest_collaboration_members.collaboration_id
            FROM quest_collaboration_members
            WHERE quest_collaboration_members.user_id = (select auth.uid())
        )
    ))
);

-- =============================================================================
-- student_access_logs (3 policies)
-- =============================================================================

DROP POLICY IF EXISTS "student_view_own_access_logs" ON public.student_access_logs;
CREATE POLICY "student_view_own_access_logs" ON public.student_access_logs
FOR SELECT USING (student_id = (select auth.uid()));

DROP POLICY IF EXISTS "parent_view_dependent_access_logs" ON public.student_access_logs;
CREATE POLICY "parent_view_dependent_access_logs" ON public.student_access_logs
FOR SELECT USING (
    student_id IN (
        SELECT users.id FROM users
        WHERE users.managed_by_parent_id = (select auth.uid()) AND users.is_dependent = true
    )
);

DROP POLICY IF EXISTS "admin_view_all_access_logs" ON public.student_access_logs;
CREATE POLICY "admin_view_all_access_logs" ON public.student_access_logs
FOR SELECT USING (EXISTS (
    SELECT 1 FROM users
    WHERE users.id = (select auth.uid()) AND users.role::text = 'admin'
));

-- =============================================================================
-- scheduled_jobs (2 policies)
-- =============================================================================

DROP POLICY IF EXISTS "Admin can insert scheduled jobs" ON public.scheduled_jobs;
CREATE POLICY "Admin can insert scheduled jobs" ON public.scheduled_jobs
FOR INSERT WITH CHECK (EXISTS (
    SELECT 1 FROM users
    WHERE users.id = (select auth.uid())
    AND users.role::text = ANY(ARRAY['admin', 'educator'])
));

DROP POLICY IF EXISTS "Admin can update scheduled jobs" ON public.scheduled_jobs;
CREATE POLICY "Admin can update scheduled jobs" ON public.scheduled_jobs
FOR UPDATE USING (EXISTS (
    SELECT 1 FROM users
    WHERE users.id = (select auth.uid())
    AND users.role::text = ANY(ARRAY['admin', 'educator'])
));

-- =============================================================================
-- observer_comments (1 policy)
-- =============================================================================

DROP POLICY IF EXISTS "observer_comments_insert_by_observer" ON public.observer_comments;
CREATE POLICY "observer_comments_insert_by_observer" ON public.observer_comments
FOR INSERT WITH CHECK (
    ((select auth.uid()) = observer_id) AND (EXISTS (
        SELECT 1 FROM observer_student_links
        WHERE observer_student_links.observer_id = (select auth.uid())
        AND observer_student_links.student_id = observer_comments.student_id
        AND observer_student_links.can_comment = true
    ))
);

-- =============================================================================
-- observer_invitations (1 policy)
-- =============================================================================

DROP POLICY IF EXISTS "observer_invitations_insert_own" ON public.observer_invitations;
CREATE POLICY "observer_invitations_insert_own" ON public.observer_invitations
FOR INSERT WITH CHECK ((select auth.uid()) = student_id);

-- =============================================================================
-- observer_likes (1 policy)
-- =============================================================================

DROP POLICY IF EXISTS "observer_insert_likes" ON public.observer_likes;
CREATE POLICY "observer_insert_likes" ON public.observer_likes
FOR INSERT WITH CHECK (
    (observer_id = (select auth.uid())) AND (EXISTS (
        SELECT 1 FROM quest_task_completions qtc
        JOIN observer_student_links osl ON osl.student_id = qtc.user_id
        WHERE qtc.id = observer_likes.completion_id
        AND osl.observer_id = (select auth.uid())
    ))
);

-- =============================================================================
-- observer_student_links (1 policy)
-- =============================================================================

DROP POLICY IF EXISTS "observer_links_insert_by_student" ON public.observer_student_links;
CREATE POLICY "observer_links_insert_by_student" ON public.observer_student_links
FOR INSERT WITH CHECK ((select auth.uid()) = student_id);

-- =============================================================================
-- organizations (1 policy)
-- =============================================================================

DROP POLICY IF EXISTS "superadmin_can_manage_organizations" ON public.organizations;
CREATE POLICY "superadmin_can_manage_organizations" ON public.organizations
FOR ALL USING (
    (select auth.uid()) IN (
        SELECT users.id FROM users
        WHERE users.role::text = 'admin' AND users.email::text = 'tannerbowman@gmail.com'
    )
);

-- =============================================================================
-- parent_connection_requests (1 policy)
-- =============================================================================

DROP POLICY IF EXISTS "parent_connection_requests_insert_own" ON public.parent_connection_requests;
CREATE POLICY "parent_connection_requests_insert_own" ON public.parent_connection_requests
FOR INSERT WITH CHECK ((select auth.uid()) = parent_user_id);

-- =============================================================================
-- parent_evidence_uploads (1 policy)
-- =============================================================================

DROP POLICY IF EXISTS "parent_evidence_insert" ON public.parent_evidence_uploads;
CREATE POLICY "parent_evidence_insert" ON public.parent_evidence_uploads
FOR INSERT WITH CHECK (EXISTS (
    SELECT 1 FROM parent_student_links
    WHERE parent_student_links.parent_user_id = (select auth.uid())
    AND parent_student_links.student_user_id = parent_evidence_uploads.student_user_id
    AND parent_student_links.admin_verified = true
));

-- =============================================================================
-- message_conversations (1 policy)
-- =============================================================================

DROP POLICY IF EXISTS "Users can create conversations" ON public.message_conversations;
CREATE POLICY "Users can create conversations" ON public.message_conversations
FOR INSERT WITH CHECK (participant_1_id = (select auth.uid()));

-- =============================================================================
-- quality_action_logs (1 policy)
-- =============================================================================

DROP POLICY IF EXISTS "Admin can insert quality action logs" ON public.quality_action_logs;
CREATE POLICY "Admin can insert quality action logs" ON public.quality_action_logs
FOR INSERT WITH CHECK (EXISTS (
    SELECT 1 FROM users
    WHERE users.id = (select auth.uid())
    AND users.role::text = ANY(ARRAY['admin', 'educator'])
));

-- =============================================================================
-- services (1 policy)
-- =============================================================================

DROP POLICY IF EXISTS "Admins can manage all services" ON public.services;
CREATE POLICY "Admins can manage all services" ON public.services
FOR ALL USING (EXISTS (
    SELECT 1 FROM users
    WHERE users.id = (select auth.uid())
    AND users.role::text = ANY(ARRAY['admin', 'superadmin'])
));

-- =============================================================================
-- service_inquiries (1 policy)
-- =============================================================================

DROP POLICY IF EXISTS "Admins can manage service inquiries" ON public.service_inquiries;
CREATE POLICY "Admins can manage service inquiries" ON public.service_inquiries
FOR ALL USING (EXISTS (
    SELECT 1 FROM users
    WHERE users.id = (select auth.uid())
    AND users.role::text = ANY(ARRAY['admin', 'superadmin'])
));

-- =============================================================================
-- tutorial_verification_log (1 policy)
-- =============================================================================

DROP POLICY IF EXISTS "Admins can view tutorial verification logs" ON public.tutorial_verification_log;
CREATE POLICY "Admins can view tutorial verification logs" ON public.tutorial_verification_log
FOR SELECT USING (EXISTS (
    SELECT 1 FROM users
    WHERE users.id = (select auth.uid())
    AND users.role::text = ANY(ARRAY['admin', 'superadmin'])
));

-- =============================================================================
-- user_segments (1 policy)
-- =============================================================================

DROP POLICY IF EXISTS "Admins can manage user segments" ON public.user_segments;
CREATE POLICY "Admins can manage user segments" ON public.user_segments
FOR ALL USING (EXISTS (
    SELECT 1 FROM users
    WHERE users.id = (select auth.uid())
    AND users.role::text = ANY(ARRAY['admin', 'superadmin'])
));

-- =============================================================================
-- user_subject_xp (1 policy)
-- =============================================================================

DROP POLICY IF EXISTS "System can manage subject XP" ON public.user_subject_xp;
CREATE POLICY "System can manage subject XP" ON public.user_subject_xp
FOR ALL USING (EXISTS (
    SELECT 1 FROM users
    WHERE users.id = (select auth.uid()) AND users.role::text = 'admin'
));

-- =============================================================================
-- parent_invitations_backup (1 policy)
-- =============================================================================

DROP POLICY IF EXISTS "Admins can view parent invitation backups" ON public.parent_invitations_backup;
CREATE POLICY "Admins can view parent invitation backups" ON public.parent_invitations_backup
FOR SELECT USING (EXISTS (
    SELECT 1 FROM users
    WHERE users.id = (select auth.uid()) AND users.role::text = 'admin'
));

-- =============================================================================
-- VERIFICATION QUERY
-- =============================================================================
-- Run this after migration to verify all policies are fixed:
--
-- SELECT tablename, policyname,
--   CASE WHEN qual LIKE '%auth.uid()%' AND qual NOT LIKE '%(select auth.uid())%' THEN 'NEEDS FIX' ELSE 'OK' END as qual_status,
--   CASE WHEN with_check LIKE '%auth.uid()%' AND with_check NOT LIKE '%(select auth.uid())%' THEN 'NEEDS FIX'
--        WHEN with_check IS NULL THEN 'N/A' ELSE 'OK' END as check_status
-- FROM pg_policies WHERE schemaname = 'public'
-- AND (qual LIKE '%auth.uid()%' OR with_check LIKE '%auth.uid()%')
-- ORDER BY tablename;
