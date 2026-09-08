-- Migration: Fix Supabase Security Warnings
-- Purpose: Address security linter warnings for function search_path and RLS policies
-- Date: 2026-01-12
-- Author: Claude Code

-- =============================================================================
-- PHASE 1: Fix Function Search Path Vulnerabilities (24 functions)
-- =============================================================================
-- Setting search_path = '' forces fully-qualified table names, preventing
-- search_path injection attacks where malicious objects could be resolved first.
--
-- Using DO blocks with exception handling to gracefully handle any signature
-- mismatches (continues on error rather than failing entire migration).

-- All 24 functions with EXACT signatures from database
-- Using direct ALTER statements (no error handling needed for exact matches)

-- Trigger functions (no parameters)
ALTER FUNCTION public.update_org_invitations_updated_at() SET search_path = '';
ALTER FUNCTION public.update_announcements_updated_at() SET search_path = '';
ALTER FUNCTION public.update_curriculum_lesson_progress_updated_at() SET search_path = '';
ALTER FUNCTION public.update_curriculum_lessons_updated_at() SET search_path = '';
ALTER FUNCTION public.update_curriculum_attachments_updated_at() SET search_path = '';
ALTER FUNCTION public.update_curriculum_settings_updated_at() SET search_path = '';
ALTER FUNCTION public.update_quest_invitations_updated_at() SET search_path = '';
ALTER FUNCTION public.update_curriculum_lesson_search_vector() SET search_path = '';
ALTER FUNCTION public.set_quest_invitation_responded_at() SET search_path = '';
ALTER FUNCTION public.sync_auth_user_deletion() SET search_path = '';
ALTER FUNCTION public.cleanup_user_data() SET search_path = '';

-- Functions with uuid parameters
ALTER FUNCTION public.is_minor(uuid) SET search_path = '';
ALTER FUNCTION public.get_parent_for_minor(uuid) SET search_path = '';
ALTER FUNCTION public.get_parent_dependents(uuid) SET search_path = '';
ALTER FUNCTION public.get_user_organization(uuid) SET search_path = '';
ALTER FUNCTION public.get_organization_analytics(uuid) SET search_path = '';
ALTER FUNCTION public.is_promotion_eligible(uuid) SET search_path = '';
ALTER FUNCTION public.verify_parent_student_access(uuid, uuid) SET search_path = '';

-- Functions with specific parameter types
ALTER FUNCTION public.calculate_promotion_eligible_date(date) SET search_path = '';
ALTER FUNCTION public.get_effective_role(users) SET search_path = '';
ALTER FUNCTION public.add_user_skill_xp(uuid, text, integer) SET search_path = '';
ALTER FUNCTION public.get_human_quest_performance(integer) SET search_path = '';

-- bypass_friendship_update has parameters (uuid, text)
ALTER FUNCTION public.bypass_friendship_update(uuid, text) SET search_path = '';

-- log_observer_access with exact signature (character varying, not varchar)
ALTER FUNCTION public.log_observer_access(
    uuid, uuid, character varying, character varying, uuid,
    character varying, text, text, jsonb
) SET search_path = '';

-- =============================================================================
-- PHASE 2: Fix RLS Policies with WITH CHECK (true)
-- =============================================================================
-- Replace overly permissive policies with service_role-only access.
-- All operations go through backend API which uses service_role.

-- 2.1: admin_audit_logs
DROP POLICY IF EXISTS "System can insert audit logs" ON public.admin_audit_logs;
CREATE POLICY "System can insert audit logs" ON public.admin_audit_logs
    FOR INSERT
    TO service_role
    WITH CHECK (true);

-- 2.2: ai_improvement_logs
DROP POLICY IF EXISTS "Service role can insert improvement logs" ON public.ai_improvement_logs;
CREATE POLICY "Service role can insert improvement logs" ON public.ai_improvement_logs
    FOR INSERT
    TO service_role
    WITH CHECK (true);

-- 2.3: consultation_requests
DROP POLICY IF EXISTS "Allow service role inserts" ON public.consultation_requests;
CREATE POLICY "Allow service role inserts" ON public.consultation_requests
    FOR INSERT
    TO service_role
    WITH CHECK (true);

-- 2.4: notifications
DROP POLICY IF EXISTS "System can create notifications" ON public.notifications;
CREATE POLICY "System can create notifications" ON public.notifications
    FOR INSERT
    TO service_role
    WITH CHECK (true);

-- 2.5: promo_signups
DROP POLICY IF EXISTS "Allow promo signups" ON public.promo_signups;
CREATE POLICY "Allow promo signups" ON public.promo_signups
    FOR INSERT
    TO service_role
    WITH CHECK (true);

-- 2.6: service_inquiries
DROP POLICY IF EXISTS "Anyone can submit service inquiries" ON public.service_inquiries;
DROP POLICY IF EXISTS "Service role can submit service inquiries" ON public.service_inquiries;
CREATE POLICY "Service role can submit service inquiries" ON public.service_inquiries
    FOR INSERT
    TO service_role
    WITH CHECK (true);

-- 2.7: student_access_logs
DROP POLICY IF EXISTS "system_insert_access_logs" ON public.student_access_logs;
CREATE POLICY "system_insert_access_logs" ON public.student_access_logs
    FOR INSERT
    TO service_role
    WITH CHECK (true);

-- 2.8: user_achievements
DROP POLICY IF EXISTS "user_achievements_insert_system" ON public.user_achievements;
CREATE POLICY "user_achievements_insert_system" ON public.user_achievements
    FOR INSERT
    TO service_role
    WITH CHECK (true);

-- 2.9: user_activity_events
DROP POLICY IF EXISTS "service_activity_insert" ON public.user_activity_events;
CREATE POLICY "service_activity_insert" ON public.user_activity_events
    FOR INSERT
    TO service_role
    WITH CHECK (true);

-- 2.10: user_skill_details (INSERT policy)
DROP POLICY IF EXISTS "User skill details insertable by system" ON public.user_skill_details;
CREATE POLICY "User skill details insertable by system" ON public.user_skill_details
    FOR INSERT
    TO service_role
    WITH CHECK (true);

-- 2.11: user_skill_details (UPDATE policy)
DROP POLICY IF EXISTS "User skill details updatable by system" ON public.user_skill_details;
CREATE POLICY "User skill details updatable by system" ON public.user_skill_details
    FOR UPDATE
    TO service_role
    USING (true)
    WITH CHECK (true);

-- =============================================================================
-- PHASE 3: Extension Migration (pg_net)
-- =============================================================================
-- Note: Moving pg_net from public schema may require Supabase support.
-- This command may fail if Supabase restricts extension schema changes.
-- If it fails, open a support ticket with Supabase.

-- Create extensions schema if not exists
CREATE SCHEMA IF NOT EXISTS extensions;

-- Attempt to move pg_net (may fail with permission error)
DO $$
BEGIN
    ALTER EXTENSION pg_net SET SCHEMA extensions;
    RAISE NOTICE 'Successfully moved pg_net to extensions schema';
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Could not move pg_net extension: %. Contact Supabase support.', SQLERRM;
END $$;

-- =============================================================================
-- PHASE 4: Documentation
-- =============================================================================
-- MANUAL ACTION REQUIRED:
--
-- 1. Postgres Version Upgrade
--    The Supabase linter detected that Postgres 17.4.1.074 has security patches.
--    To upgrade:
--    - Go to Supabase Dashboard > Project Settings > Infrastructure
--    - Click "Upgrade" next to the Postgres version
--    - Schedule a maintenance window for the upgrade
--
-- 2. If pg_net extension move failed
--    - Open a support ticket at https://supabase.com/dashboard/support
--    - Request moving pg_net from public to extensions schema
--
-- =============================================================================

-- =============================================================================
-- VERIFICATION QUERIES (run manually after migration)
-- =============================================================================

-- Check function search_path settings (should show search_path='' for all fixed functions)
-- SELECT p.proname as function_name,
--        pg_get_function_identity_arguments(p.oid) as arguments,
--        p.proconfig as config
-- FROM pg_proc p
-- JOIN pg_namespace n ON p.pronamespace = n.oid
-- WHERE n.nspname = 'public'
-- AND p.proconfig IS NOT NULL
-- AND 'search_path=' = ANY(p.proconfig);

-- Check RLS policies (should show service_role only)
-- SELECT schemaname, tablename, policyname, roles, cmd, qual, with_check
-- FROM pg_policies
-- WHERE tablename IN ('admin_audit_logs', 'ai_improvement_logs', 'consultation_requests',
--                     'notifications', 'promo_signups', 'service_inquiries',
--                     'student_access_logs', 'user_achievements', 'user_activity_events',
--                     'user_skill_details');

-- Check pg_net extension schema
-- SELECT extname, nspname as schema
-- FROM pg_extension e
-- JOIN pg_namespace n ON e.extnamespace = n.oid
-- WHERE extname = 'pg_net';

-- List any functions still without search_path set
-- SELECT p.proname as function_name,
--        pg_get_function_identity_arguments(p.oid) as arguments
-- FROM pg_proc p
-- JOIN pg_namespace n ON p.pronamespace = n.oid
-- WHERE n.nspname = 'public'
-- AND p.prokind = 'f'
-- AND (p.proconfig IS NULL OR NOT 'search_path=' = ANY(p.proconfig))
-- AND p.proname IN (
--     'is_minor', 'update_org_invitations_updated_at', 'update_announcements_updated_at',
--     'get_parent_for_minor', 'update_curriculum_lesson_progress_updated_at',
--     'get_user_organization', 'update_curriculum_lessons_updated_at',
--     'update_curriculum_attachments_updated_at', 'sync_auth_user_deletion',
--     'update_curriculum_settings_updated_at', 'add_user_skill_xp',
--     'update_quest_invitations_updated_at', 'calculate_promotion_eligible_date',
--     'cleanup_user_data', 'get_organization_analytics', 'set_quest_invitation_responded_at',
--     'bypass_friendship_update', 'is_promotion_eligible', 'get_effective_role',
--     'update_curriculum_lesson_search_vector', 'get_human_quest_performance',
--     'verify_parent_student_access', 'log_observer_access', 'get_parent_dependents'
-- );
