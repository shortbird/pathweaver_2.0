-- Migration: Fix RLS Performance - Auth InitPlan Optimization
-- Purpose: Wrap auth.uid() calls in (select auth.uid()) to evaluate once per query instead of per row
-- Date: 2026-01-12
-- Reference: https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select

-- =============================================================================
-- OVERVIEW
-- =============================================================================
-- Supabase linter identified ~60+ policies where auth.uid() is called without
-- a subquery wrapper. This causes the function to be re-evaluated for EVERY ROW
-- scanned, which degrades performance at scale.
--
-- FIX: Change `auth.uid()` to `(select auth.uid())`
-- This creates a scalar subquery that PostgreSQL evaluates once per statement.

-- =============================================================================
-- PHASE 1: Simple user_id = auth.uid() patterns (high-traffic tables)
-- =============================================================================

-- lms_integrations (4 policies)
DROP POLICY IF EXISTS "lms_integrations_select_own" ON public.lms_integrations;
CREATE POLICY "lms_integrations_select_own" ON public.lms_integrations
FOR SELECT USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "lms_integrations_insert_own" ON public.lms_integrations;
CREATE POLICY "lms_integrations_insert_own" ON public.lms_integrations
FOR INSERT WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "lms_integrations_update_own" ON public.lms_integrations;
CREATE POLICY "lms_integrations_update_own" ON public.lms_integrations
FOR UPDATE USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "lms_integrations_delete_own" ON public.lms_integrations;
CREATE POLICY "lms_integrations_delete_own" ON public.lms_integrations
FOR DELETE USING ((select auth.uid()) = user_id);

-- lms_sessions (1 policy)
DROP POLICY IF EXISTS "lms_sessions_select_own" ON public.lms_sessions;
CREATE POLICY "lms_sessions_select_own" ON public.lms_sessions
FOR SELECT USING ((select auth.uid()) = user_id);

-- lms_grade_sync (1 policy)
DROP POLICY IF EXISTS "lms_grade_sync_select_own" ON public.lms_grade_sync;
CREATE POLICY "lms_grade_sync_select_own" ON public.lms_grade_sync
FOR SELECT USING ((select auth.uid()) = user_id);

-- announcement_reads (3 policies)
DROP POLICY IF EXISTS "Users can view their own announcement reads" ON public.announcement_reads;
CREATE POLICY "Users can view their own announcement reads" ON public.announcement_reads
FOR SELECT USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can mark announcements as read" ON public.announcement_reads;
CREATE POLICY "Users can mark announcements as read" ON public.announcement_reads
FOR INSERT WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can update their own read records" ON public.announcement_reads;
CREATE POLICY "Users can update their own read records" ON public.announcement_reads
FOR UPDATE USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);

-- learning_events (4 policies - 2 need fixing)
DROP POLICY IF EXISTS "Users can insert own learning events" ON public.learning_events;
CREATE POLICY "Users can insert own learning events" ON public.learning_events
FOR INSERT WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can update own learning events" ON public.learning_events;
CREATE POLICY "Users can update own learning events" ON public.learning_events
FOR UPDATE USING ((select auth.uid()) = user_id);

-- course_enrollments (simple patterns)
DROP POLICY IF EXISTS "users_update_own_enrollments" ON public.course_enrollments;
CREATE POLICY "users_update_own_enrollments" ON public.course_enrollments
FOR UPDATE USING (user_id = (select auth.uid())) WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "users_view_own_enrollments" ON public.course_enrollments;
CREATE POLICY "users_view_own_enrollments" ON public.course_enrollments
FOR SELECT USING (user_id = (select auth.uid()));

-- calendar_view_preferences (2 policies need fixing)
DROP POLICY IF EXISTS "Users can insert their own preferences" ON public.calendar_view_preferences;
CREATE POLICY "Users can insert their own preferences" ON public.calendar_view_preferences
FOR INSERT WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can update their own preferences" ON public.calendar_view_preferences;
CREATE POLICY "Users can update their own preferences" ON public.calendar_view_preferences
FOR UPDATE USING ((select auth.uid()) = user_id);

-- direct_messages (INSERT policy)
DROP POLICY IF EXISTS "Users can send messages" ON public.direct_messages;
CREATE POLICY "Users can send messages" ON public.direct_messages
FOR INSERT WITH CHECK (sender_id = (select auth.uid()));

-- diplomas (INSERT policy)
DROP POLICY IF EXISTS "diplomas_insert" ON public.diplomas;
CREATE POLICY "diplomas_insert" ON public.diplomas
FOR INSERT WITH CHECK ((user_id = (select auth.uid())) OR is_admin());

-- =============================================================================
-- PHASE 2: EXISTS subquery patterns (admin/role checks)
-- =============================================================================

-- admin_audit_logs
DROP POLICY IF EXISTS "School admins can view their org audit logs" ON public.admin_audit_logs;
CREATE POLICY "School admins can view their org audit logs" ON public.admin_audit_logs
FOR SELECT USING (EXISTS (
    SELECT 1 FROM users
    WHERE users.id = (select auth.uid())
    AND users.organization_id = admin_audit_logs.organization_id
    AND (users.is_org_admin = true OR users.role::text = 'admin'::text)
));

-- admin_masquerade_log (3 policies)
DROP POLICY IF EXISTS "Admins can view all masquerade logs" ON public.admin_masquerade_log;
CREATE POLICY "Admins can view all masquerade logs" ON public.admin_masquerade_log
FOR SELECT USING (EXISTS (
    SELECT 1 FROM users
    WHERE users.id = (select auth.uid()) AND users.role::text = 'admin'::text
));

DROP POLICY IF EXISTS "Admins can insert masquerade logs" ON public.admin_masquerade_log;
CREATE POLICY "Admins can insert masquerade logs" ON public.admin_masquerade_log
FOR INSERT WITH CHECK (EXISTS (
    SELECT 1 FROM users
    WHERE users.id = (select auth.uid()) AND users.role::text = 'admin'::text
));

DROP POLICY IF EXISTS "Admins can update masquerade logs" ON public.admin_masquerade_log;
CREATE POLICY "Admins can update masquerade logs" ON public.admin_masquerade_log
FOR UPDATE USING (EXISTS (
    SELECT 1 FROM users
    WHERE users.id = (select auth.uid()) AND users.role::text = 'admin'::text
));

-- advisor_checkins (4 policies)
DROP POLICY IF EXISTS "advisor_view_own_checkins" ON public.advisor_checkins;
CREATE POLICY "advisor_view_own_checkins" ON public.advisor_checkins
FOR SELECT USING (
    advisor_id = (select auth.uid()) OR EXISTS (
        SELECT 1 FROM users
        WHERE users.id = (select auth.uid())
        AND users.role::text = ANY(ARRAY['admin'::text, 'advisor'::text])
    )
);

DROP POLICY IF EXISTS "advisor_create_checkins" ON public.advisor_checkins;
CREATE POLICY "advisor_create_checkins" ON public.advisor_checkins
FOR INSERT WITH CHECK (
    advisor_id = (select auth.uid()) AND EXISTS (
        SELECT 1 FROM users
        WHERE users.id = (select auth.uid())
        AND users.role::text = ANY(ARRAY['admin'::text, 'advisor'::text])
    )
);

DROP POLICY IF EXISTS "advisor_update_own_checkins" ON public.advisor_checkins;
CREATE POLICY "advisor_update_own_checkins" ON public.advisor_checkins
FOR UPDATE USING (
    advisor_id = (select auth.uid()) OR EXISTS (
        SELECT 1 FROM users
        WHERE users.id = (select auth.uid()) AND users.role::text = 'admin'::text
    )
);

DROP POLICY IF EXISTS "admin_delete_checkins" ON public.advisor_checkins;
CREATE POLICY "admin_delete_checkins" ON public.advisor_checkins
FOR DELETE USING (EXISTS (
    SELECT 1 FROM users
    WHERE users.id = (select auth.uid()) AND users.role::text = 'admin'::text
));

-- advisor_notes (4 policies)
DROP POLICY IF EXISTS "advisor_notes_advisor_select" ON public.advisor_notes;
CREATE POLICY "advisor_notes_advisor_select" ON public.advisor_notes
FOR SELECT USING (
    advisor_id = (select auth.uid()) OR EXISTS (
        SELECT 1 FROM users
        WHERE users.id = (select auth.uid()) AND users.role::text = 'admin'::text
    )
);

DROP POLICY IF EXISTS "advisor_notes_advisor_insert" ON public.advisor_notes;
CREATE POLICY "advisor_notes_advisor_insert" ON public.advisor_notes
FOR INSERT WITH CHECK (
    advisor_id = (select auth.uid()) OR EXISTS (
        SELECT 1 FROM users
        WHERE users.id = (select auth.uid())
        AND users.role::text = ANY(ARRAY['admin'::text, 'advisor'::text])
    )
);

DROP POLICY IF EXISTS "advisor_notes_advisor_update" ON public.advisor_notes;
CREATE POLICY "advisor_notes_advisor_update" ON public.advisor_notes
FOR UPDATE USING (
    advisor_id = (select auth.uid()) OR EXISTS (
        SELECT 1 FROM users
        WHERE users.id = (select auth.uid()) AND users.role::text = 'admin'::text
    )
);

DROP POLICY IF EXISTS "advisor_notes_advisor_delete" ON public.advisor_notes;
CREATE POLICY "advisor_notes_advisor_delete" ON public.advisor_notes
FOR DELETE USING (
    advisor_id = (select auth.uid()) OR EXISTS (
        SELECT 1 FROM users
        WHERE users.id = (select auth.uid()) AND users.role::text = 'admin'::text
    )
);

-- advisor_student_assignments (2 policies)
DROP POLICY IF EXISTS "Admins can manage advisor assignments" ON public.advisor_student_assignments;
CREATE POLICY "Admins can manage advisor assignments" ON public.advisor_student_assignments
FOR ALL USING (EXISTS (
    SELECT 1 FROM users
    WHERE users.id = (select auth.uid()) AND users.role::text = 'admin'::text
));

DROP POLICY IF EXISTS "Advisors can view their assignments" ON public.advisor_student_assignments;
CREATE POLICY "Advisors can view their assignments" ON public.advisor_student_assignments
FOR SELECT USING (
    advisor_id = (select auth.uid()) OR EXISTS (
        SELECT 1 FROM users
        WHERE users.id = (select auth.uid()) AND users.role::text = 'admin'::text
    )
);

-- ai_prompt_components
DROP POLICY IF EXISTS "Superadmin full access to ai_prompt_components" ON public.ai_prompt_components;
CREATE POLICY "Superadmin full access to ai_prompt_components" ON public.ai_prompt_components
FOR ALL USING (EXISTS (
    SELECT 1 FROM users
    WHERE users.id = (select auth.uid()) AND users.role::text = 'superadmin'::text
));

-- automation_sequences
DROP POLICY IF EXISTS "Admins can manage automation sequences" ON public.automation_sequences;
CREATE POLICY "Admins can manage automation sequences" ON public.automation_sequences
FOR ALL USING (EXISTS (
    SELECT 1 FROM users
    WHERE users.id = (select auth.uid())
    AND users.role::text = ANY(ARRAY['admin'::text, 'superadmin'::text])
));

-- email_campaign_sends
DROP POLICY IF EXISTS "Admins can view email campaign sends" ON public.email_campaign_sends;
CREATE POLICY "Admins can view email campaign sends" ON public.email_campaign_sends
FOR SELECT USING (EXISTS (
    SELECT 1 FROM users
    WHERE users.id = (select auth.uid())
    AND users.role::text = ANY(ARRAY['admin'::text, 'superadmin'::text])
));

-- email_campaigns
DROP POLICY IF EXISTS "Admins can manage email campaigns" ON public.email_campaigns;
CREATE POLICY "Admins can manage email campaigns" ON public.email_campaigns
FOR ALL USING (EXISTS (
    SELECT 1 FROM users
    WHERE users.id = (select auth.uid())
    AND users.role::text = ANY(ARRAY['admin'::text, 'superadmin'::text])
));

-- email_templates
DROP POLICY IF EXISTS "Admins can manage email templates" ON public.email_templates;
CREATE POLICY "Admins can manage email templates" ON public.email_templates
FOR ALL USING (EXISTS (
    SELECT 1 FROM users
    WHERE users.id = (select auth.uid())
    AND users.role::text = ANY(ARRAY['admin'::text, 'superadmin'::text])
));

-- credit_ledger
DROP POLICY IF EXISTS "credit_ledger_insert_policy" ON public.credit_ledger;
CREATE POLICY "credit_ledger_insert_policy" ON public.credit_ledger
FOR INSERT WITH CHECK (EXISTS (
    SELECT 1 FROM users
    WHERE users.id = (select auth.uid()) AND users.role::text = 'admin'::text
));

-- =============================================================================
-- PHASE 3: Complex patterns (announcements, courses, curriculum)
-- =============================================================================

-- announcements (4 policies)
DROP POLICY IF EXISTS "Users can view announcements from their organization" ON public.announcements;
CREATE POLICY "Users can view announcements from their organization" ON public.announcements
FOR SELECT USING (EXISTS (
    SELECT 1 FROM users
    WHERE users.id = (select auth.uid())
    AND users.organization_id = announcements.organization_id
));

DROP POLICY IF EXISTS "Advisors and admins can create announcements" ON public.announcements;
CREATE POLICY "Advisors and admins can create announcements" ON public.announcements
FOR INSERT WITH CHECK (
    (select auth.uid()) = author_id AND EXISTS (
        SELECT 1 FROM users
        WHERE users.id = (select auth.uid())
        AND users.organization_id = announcements.organization_id
        AND users.role::text = ANY(ARRAY['advisor'::text, 'educator'::text, 'admin'::text])
    )
);

DROP POLICY IF EXISTS "Authors can update their announcements" ON public.announcements;
CREATE POLICY "Authors can update their announcements" ON public.announcements
FOR UPDATE USING ((select auth.uid()) = author_id) WITH CHECK ((select auth.uid()) = author_id);

DROP POLICY IF EXISTS "Authors and admins can delete announcements" ON public.announcements;
CREATE POLICY "Authors and admins can delete announcements" ON public.announcements
FOR DELETE USING (
    (select auth.uid()) = author_id OR EXISTS (
        SELECT 1 FROM users
        WHERE users.id = (select auth.uid())
        AND users.organization_id = announcements.organization_id
        AND (users.role::text = 'admin'::text OR users.is_org_admin = true)
    )
);

-- curriculum_attachments (4 policies)
DROP POLICY IF EXISTS "curriculum_attachments_org_isolation" ON public.curriculum_attachments;
CREATE POLICY "curriculum_attachments_org_isolation" ON public.curriculum_attachments
FOR SELECT USING (
    organization_id IS NULL OR organization_id IN (
        SELECT users.organization_id FROM users WHERE users.id = (select auth.uid())
    )
);

DROP POLICY IF EXISTS "curriculum_attachments_insert" ON public.curriculum_attachments;
CREATE POLICY "curriculum_attachments_insert" ON public.curriculum_attachments
FOR INSERT WITH CHECK (
    organization_id IS NULL OR organization_id IN (
        SELECT users.organization_id FROM users WHERE users.id = (select auth.uid())
    )
);

DROP POLICY IF EXISTS "curriculum_attachments_update" ON public.curriculum_attachments;
CREATE POLICY "curriculum_attachments_update" ON public.curriculum_attachments
FOR UPDATE USING (
    uploaded_by = (select auth.uid()) OR EXISTS (
        SELECT 1 FROM users
        WHERE users.id = (select auth.uid())
        AND users.role::text = ANY(ARRAY['advisor'::text, 'educator'::text, 'admin'::text, 'superadmin'::text])
    )
);

DROP POLICY IF EXISTS "curriculum_attachments_delete" ON public.curriculum_attachments;
CREATE POLICY "curriculum_attachments_delete" ON public.curriculum_attachments
FOR DELETE USING (
    uploaded_by = (select auth.uid()) OR EXISTS (
        SELECT 1 FROM users
        WHERE users.id = (select auth.uid())
        AND users.role::text = ANY(ARRAY['advisor'::text, 'educator'::text, 'admin'::text, 'superadmin'::text])
    )
);

-- curriculum_uploads (3 policies)
DROP POLICY IF EXISTS "curriculum_uploads_advisor_own" ON public.curriculum_uploads;
CREATE POLICY "curriculum_uploads_advisor_own" ON public.curriculum_uploads
FOR ALL USING (
    uploaded_by = (select auth.uid()) AND EXISTS (
        SELECT 1 FROM users
        WHERE users.id = (select auth.uid())
        AND users.role::text = ANY(ARRAY['advisor'::text, 'org_admin'::text, 'superadmin'::text])
    )
);

DROP POLICY IF EXISTS "curriculum_uploads_org_admin_select" ON public.curriculum_uploads;
CREATE POLICY "curriculum_uploads_org_admin_select" ON public.curriculum_uploads
FOR SELECT USING (
    organization_id IN (
        SELECT users.organization_id FROM users
        WHERE users.id = (select auth.uid()) AND users.role::text = 'org_admin'::text
    )
);

DROP POLICY IF EXISTS "curriculum_uploads_superadmin_all" ON public.curriculum_uploads;
CREATE POLICY "curriculum_uploads_superadmin_all" ON public.curriculum_uploads
FOR ALL USING (EXISTS (
    SELECT 1 FROM users
    WHERE users.id = (select auth.uid()) AND users.role::text = 'superadmin'::text
));

-- courses (4 policies)
DROP POLICY IF EXISTS "users_view_org_courses" ON public.courses;
CREATE POLICY "users_view_org_courses" ON public.courses
FOR SELECT USING (
    organization_id IN (
        SELECT users.organization_id FROM users WHERE users.id = (select auth.uid())
    )
);

DROP POLICY IF EXISTS "admins_teachers_create_courses" ON public.courses;
CREATE POLICY "admins_teachers_create_courses" ON public.courses
FOR INSERT WITH CHECK (
    organization_id IN (
        SELECT users.organization_id FROM users
        WHERE users.id = (select auth.uid())
        AND users.role::text = ANY(ARRAY['admin'::text, 'org_admin'::text, 'teacher'::text])
    )
);

DROP POLICY IF EXISTS "creators_admins_update_courses" ON public.courses;
CREATE POLICY "creators_admins_update_courses" ON public.courses
FOR UPDATE
USING (
    created_by = (select auth.uid()) OR organization_id IN (
        SELECT users.organization_id FROM users
        WHERE users.id = (select auth.uid())
        AND users.role::text = ANY(ARRAY['admin'::text, 'org_admin'::text])
    )
)
WITH CHECK (
    created_by = (select auth.uid()) OR organization_id IN (
        SELECT users.organization_id FROM users
        WHERE users.id = (select auth.uid())
        AND users.role::text = ANY(ARRAY['admin'::text, 'org_admin'::text])
    )
);

DROP POLICY IF EXISTS "creators_admins_delete_courses" ON public.courses;
CREATE POLICY "creators_admins_delete_courses" ON public.courses
FOR DELETE USING (
    created_by = (select auth.uid()) OR organization_id IN (
        SELECT users.organization_id FROM users
        WHERE users.id = (select auth.uid())
        AND users.role::text = ANY(ARRAY['admin'::text, 'org_admin'::text])
    )
);

-- course_quests (2 policies)
DROP POLICY IF EXISTS "users_view_course_quests" ON public.course_quests;
CREATE POLICY "users_view_course_quests" ON public.course_quests
FOR SELECT USING (
    course_id IN (
        SELECT courses.id FROM courses
        WHERE courses.organization_id IN (
            SELECT users.organization_id FROM users WHERE users.id = (select auth.uid())
        )
    )
);

DROP POLICY IF EXISTS "creators_admins_manage_course_quests" ON public.course_quests;
CREATE POLICY "creators_admins_manage_course_quests" ON public.course_quests
FOR ALL
USING (
    course_id IN (
        SELECT courses.id FROM courses
        WHERE courses.created_by = (select auth.uid()) OR courses.organization_id IN (
            SELECT users.organization_id FROM users
            WHERE users.id = (select auth.uid())
            AND users.role::text = ANY(ARRAY['admin'::text, 'org_admin'::text, 'teacher'::text])
        )
    )
)
WITH CHECK (
    course_id IN (
        SELECT courses.id FROM courses
        WHERE courses.created_by = (select auth.uid()) OR courses.organization_id IN (
            SELECT users.organization_id FROM users
            WHERE users.id = (select auth.uid())
            AND users.role::text = ANY(ARRAY['admin'::text, 'org_admin'::text, 'teacher'::text])
        )
    )
);

-- course_enrollments (complex policies)
DROP POLICY IF EXISTS "users_enroll_in_courses" ON public.course_enrollments;
CREATE POLICY "users_enroll_in_courses" ON public.course_enrollments
FOR INSERT WITH CHECK (
    user_id = (select auth.uid()) AND course_id IN (
        SELECT courses.id FROM courses
        WHERE courses.status::text = 'published'::text
        AND courses.organization_id IN (
            SELECT users.organization_id FROM users WHERE users.id = (select auth.uid())
        )
    )
);

DROP POLICY IF EXISTS "teachers_admins_view_enrollments" ON public.course_enrollments;
CREATE POLICY "teachers_admins_view_enrollments" ON public.course_enrollments
FOR SELECT USING (
    course_id IN (
        SELECT courses.id FROM courses
        WHERE courses.organization_id IN (
            SELECT users.organization_id FROM users
            WHERE users.id = (select auth.uid())
            AND users.role::text = ANY(ARRAY['admin'::text, 'org_admin'::text, 'teacher'::text])
        )
    )
);

DROP POLICY IF EXISTS "teachers_admins_enroll_users" ON public.course_enrollments;
CREATE POLICY "teachers_admins_enroll_users" ON public.course_enrollments
FOR INSERT WITH CHECK (
    course_id IN (
        SELECT courses.id FROM courses
        WHERE courses.organization_id IN (
            SELECT users.organization_id FROM users
            WHERE users.id = (select auth.uid())
            AND users.role::text = ANY(ARRAY['admin'::text, 'org_admin'::text, 'teacher'::text])
        )
    )
);

DROP POLICY IF EXISTS "teachers_admins_update_enrollments" ON public.course_enrollments;
CREATE POLICY "teachers_admins_update_enrollments" ON public.course_enrollments
FOR UPDATE
USING (
    course_id IN (
        SELECT courses.id FROM courses
        WHERE courses.organization_id IN (
            SELECT users.organization_id FROM users
            WHERE users.id = (select auth.uid())
            AND users.role::text = ANY(ARRAY['admin'::text, 'org_admin'::text, 'teacher'::text])
        )
    )
)
WITH CHECK (
    course_id IN (
        SELECT courses.id FROM courses
        WHERE courses.organization_id IN (
            SELECT users.organization_id FROM users
            WHERE users.id = (select auth.uid())
            AND users.role::text = ANY(ARRAY['admin'::text, 'org_admin'::text, 'teacher'::text])
        )
    )
);

DROP POLICY IF EXISTS "teachers_admins_delete_enrollments" ON public.course_enrollments;
CREATE POLICY "teachers_admins_delete_enrollments" ON public.course_enrollments
FOR DELETE USING (
    course_id IN (
        SELECT courses.id FROM courses
        WHERE courses.organization_id IN (
            SELECT users.organization_id FROM users
            WHERE users.id = (select auth.uid())
            AND users.role::text = ANY(ARRAY['admin'::text, 'org_admin'::text, 'teacher'::text])
        )
    )
);

-- learning_event_evidence_blocks (2 policies need fixing)
DROP POLICY IF EXISTS "Users can insert own evidence blocks" ON public.learning_event_evidence_blocks;
CREATE POLICY "Users can insert own evidence blocks" ON public.learning_event_evidence_blocks
FOR INSERT WITH CHECK (EXISTS (
    SELECT 1 FROM learning_events
    WHERE learning_events.id = learning_event_evidence_blocks.learning_event_id
    AND learning_events.user_id = (select auth.uid())
));

DROP POLICY IF EXISTS "Users can update own evidence blocks" ON public.learning_event_evidence_blocks;
CREATE POLICY "Users can update own evidence blocks" ON public.learning_event_evidence_blocks
FOR UPDATE USING (EXISTS (
    SELECT 1 FROM learning_events
    WHERE learning_events.id = learning_event_evidence_blocks.learning_event_id
    AND learning_events.user_id = (select auth.uid())
));

-- =============================================================================
-- VERIFICATION QUERY (run after migration)
-- =============================================================================
-- Run this to verify policies now use (select auth.uid()):
--
-- SELECT tablename, policyname,
--        CASE WHEN qual LIKE '%( SELECT auth.uid()%' OR qual LIKE '%(select auth.uid()%' THEN 'FIXED' ELSE 'CHECK' END as qual_status,
--        CASE WHEN with_check LIKE '%( SELECT auth.uid()%' OR with_check LIKE '%(select auth.uid()%' THEN 'FIXED'
--             WHEN with_check IS NULL THEN 'N/A' ELSE 'CHECK' END as with_check_status
-- FROM pg_policies
-- WHERE schemaname = 'public'
-- ORDER BY tablename, policyname;
