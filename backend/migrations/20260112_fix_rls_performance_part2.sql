-- Migration: Fix RLS Performance Part 2 - Remaining Tables
-- Purpose: Wrap auth.uid() calls in (select auth.uid()) to evaluate once per query
-- Date: 2026-01-12
-- Tables: notifications, observer_*, organization_course_access, parent_*, tutor_settings, user_activity_events

-- =============================================================================
-- notifications (3 policies)
-- =============================================================================

DROP POLICY IF EXISTS "Users can view their own notifications" ON public.notifications;
CREATE POLICY "Users can view their own notifications" ON public.notifications
FOR SELECT USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can update their own notifications" ON public.notifications;
CREATE POLICY "Users can update their own notifications" ON public.notifications
FOR UPDATE USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can delete their own notifications" ON public.notifications;
CREATE POLICY "Users can delete their own notifications" ON public.notifications
FOR DELETE USING ((select auth.uid()) = user_id);

-- =============================================================================
-- observer_comments (1 policy)
-- =============================================================================

DROP POLICY IF EXISTS "observer_comments_select_related" ON public.observer_comments;
CREATE POLICY "observer_comments_select_related" ON public.observer_comments
FOR SELECT USING (
    ((select auth.uid()) = observer_id) OR
    ((select auth.uid()) = student_id) OR
    ((select auth.uid()) IN (
        SELECT observer_student_links.observer_id
        FROM observer_student_links
        WHERE observer_student_links.student_id = observer_comments.student_id
    ))
);

-- =============================================================================
-- observer_invitations (3 policies)
-- =============================================================================

DROP POLICY IF EXISTS "observer_invitations_select_own" ON public.observer_invitations;
CREATE POLICY "observer_invitations_select_own" ON public.observer_invitations
FOR SELECT USING (
    ((select auth.uid()) = student_id) OR
    (observer_email = (
        SELECT users.email FROM users WHERE users.id = (select auth.uid())
    )::text)
);

DROP POLICY IF EXISTS "observer_invitations_update_own" ON public.observer_invitations;
CREATE POLICY "observer_invitations_update_own" ON public.observer_invitations
FOR UPDATE USING ((select auth.uid()) = student_id);

DROP POLICY IF EXISTS "observer_invitations_delete_own" ON public.observer_invitations;
CREATE POLICY "observer_invitations_delete_own" ON public.observer_invitations
FOR DELETE USING ((select auth.uid()) = student_id);

-- =============================================================================
-- observer_likes (3 policies)
-- =============================================================================

DROP POLICY IF EXISTS "observer_view_likes" ON public.observer_likes;
CREATE POLICY "observer_view_likes" ON public.observer_likes
FOR SELECT USING (
    (observer_id = (select auth.uid())) OR
    (EXISTS (
        SELECT 1 FROM quest_task_completions qtc
        JOIN observer_student_links osl ON osl.student_id = qtc.user_id
        WHERE qtc.id = observer_likes.completion_id
        AND osl.observer_id = (select auth.uid())
    ))
);

DROP POLICY IF EXISTS "observer_delete_likes" ON public.observer_likes;
CREATE POLICY "observer_delete_likes" ON public.observer_likes
FOR DELETE USING (observer_id = (select auth.uid()));

DROP POLICY IF EXISTS "admin_manage_likes" ON public.observer_likes;
CREATE POLICY "admin_manage_likes" ON public.observer_likes
FOR ALL USING (EXISTS (
    SELECT 1 FROM users
    WHERE users.id = (select auth.uid())
    AND users.role::text = ANY(ARRAY['admin'::text, 'superadmin'::text])
));

-- =============================================================================
-- observer_student_links (2 policies)
-- =============================================================================

DROP POLICY IF EXISTS "observer_links_select_own" ON public.observer_student_links;
CREATE POLICY "observer_links_select_own" ON public.observer_student_links
FOR SELECT USING (
    ((select auth.uid()) = observer_id) OR ((select auth.uid()) = student_id)
);

DROP POLICY IF EXISTS "observer_links_delete_by_student" ON public.observer_student_links;
CREATE POLICY "observer_links_delete_by_student" ON public.observer_student_links
FOR DELETE USING ((select auth.uid()) = student_id);

-- =============================================================================
-- organization_course_access (2 policies)
-- =============================================================================

DROP POLICY IF EXISTS "users_can_view_org_course_access" ON public.organization_course_access;
CREATE POLICY "users_can_view_org_course_access" ON public.organization_course_access
FOR SELECT USING (
    organization_id IN (
        SELECT users.organization_id FROM users WHERE users.id = (select auth.uid())
    )
);

DROP POLICY IF EXISTS "org_admins_can_manage_course_access" ON public.organization_course_access;
CREATE POLICY "org_admins_can_manage_course_access" ON public.organization_course_access
FOR ALL USING (
    organization_id IN (
        SELECT users.organization_id FROM users
        WHERE users.id = (select auth.uid())
        AND (users.is_org_admin = true OR users.role::text = ANY(ARRAY['admin'::text, 'superadmin'::text, 'org_admin'::text]))
    )
);

-- =============================================================================
-- parent_connection_requests (2 policies)
-- =============================================================================

DROP POLICY IF EXISTS "parent_connection_requests_select_own" ON public.parent_connection_requests;
CREATE POLICY "parent_connection_requests_select_own" ON public.parent_connection_requests
FOR SELECT USING ((select auth.uid()) = parent_user_id);

DROP POLICY IF EXISTS "parent_connection_requests_admin_all" ON public.parent_connection_requests;
CREATE POLICY "parent_connection_requests_admin_all" ON public.parent_connection_requests
FOR ALL USING (EXISTS (
    SELECT 1 FROM users
    WHERE users.id = (select auth.uid()) AND users.role::text = 'admin'::text
));

-- =============================================================================
-- parent_student_links (2 policies need fixing)
-- =============================================================================

DROP POLICY IF EXISTS "parent_links_update_student" ON public.parent_student_links;
CREATE POLICY "parent_links_update_student" ON public.parent_student_links
FOR UPDATE USING ((select auth.uid()) = student_user_id);

DROP POLICY IF EXISTS "parent_student_links_admin_manage" ON public.parent_student_links;
CREATE POLICY "parent_student_links_admin_manage" ON public.parent_student_links
FOR ALL USING (EXISTS (
    SELECT 1 FROM users
    WHERE users.id = (select auth.uid()) AND users.role::text = 'admin'::text
));

-- =============================================================================
-- tutor_settings (1 policy)
-- =============================================================================

DROP POLICY IF EXISTS "Users can view own settings" ON public.tutor_settings;
CREATE POLICY "Users can view own settings" ON public.tutor_settings
FOR ALL USING ((select auth.uid()) = user_id);

-- =============================================================================
-- user_activity_events (2 policies)
-- =============================================================================

DROP POLICY IF EXISTS "user_activity_select_own" ON public.user_activity_events;
CREATE POLICY "user_activity_select_own" ON public.user_activity_events
FOR SELECT USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "admin_activity_select_all" ON public.user_activity_events;
CREATE POLICY "admin_activity_select_all" ON public.user_activity_events
FOR ALL USING (EXISTS (
    SELECT 1 FROM users
    WHERE users.id = (select auth.uid()) AND users.role::text = 'admin'::text
));

-- =============================================================================
-- VERIFICATION
-- =============================================================================
-- Run after migration:
-- SELECT tablename, policyname,
--        CASE WHEN qual LIKE '%select auth.uid()%' THEN 'FIXED' ELSE 'CHECK' END as status
-- FROM pg_policies WHERE schemaname = 'public'
-- AND tablename IN ('notifications', 'observer_comments', 'observer_invitations',
--     'observer_likes', 'observer_student_links', 'organization_course_access',
--     'parent_connection_requests', 'parent_student_links', 'tutor_settings', 'user_activity_events')
-- ORDER BY tablename;
