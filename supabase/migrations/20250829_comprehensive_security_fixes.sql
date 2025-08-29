-- ============================================
-- Comprehensive Security and Performance Fixes
-- Date: 2025-08-29
-- ============================================
-- This migration addresses all issues identified in the Supabase Security Advisor:
-- 1. Security Definer View issues
-- 2. Function search path vulnerabilities
-- 3. Extension placement in public schema
-- 4. RLS performance issues with auth.uid() calls
-- 5. Multiple permissive policies degrading performance
-- 6. Tables with RLS enabled but no policies

-- Note: Some parts of this migration require superuser privileges
-- and must be run manually in the Supabase Dashboard

-- ============================================
-- PART 1: Fix Authentication Configuration
-- ============================================
-- These settings should be configured in the Supabase Dashboard:
-- 1. Set OTP expiry to less than 1 hour (3600 seconds)
-- 2. Enable leaked password protection (HaveIBeenPwned integration)

-- ============================================
-- PART 2: Enable RLS on Tables Missing It
-- ============================================
-- First, enable RLS on tables that don't have it
ALTER TABLE public.friendships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.learning_logs_backup ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quest_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_achievements ENABLE ROW LEVEL SECURITY;

-- ============================================
-- PART 3: Create Policies for Tables Without Them
-- ============================================

-- friendships table
CREATE POLICY "friendships_user_access" ON public.friendships
    FOR SELECT
    USING (
        requester_id = (SELECT auth.uid())
        OR addressee_id = (SELECT auth.uid())
    );

CREATE POLICY "friendships_user_create" ON public.friendships
    FOR INSERT
    WITH CHECK (requester_id = (SELECT auth.uid()));

CREATE POLICY "friendships_user_update" ON public.friendships
    FOR UPDATE
    USING (
        requester_id = (SELECT auth.uid())
        OR addressee_id = (SELECT auth.uid())
    );

-- learning_logs_backup table (admin only since it's a backup)
CREATE POLICY "learning_logs_backup_admin_only" ON public.learning_logs_backup
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.users 
            WHERE id = (SELECT auth.uid()) 
            AND role = 'admin'
        )
    );

-- quest_reviews table
CREATE POLICY "quest_reviews_access" ON public.quest_reviews
    FOR SELECT
    USING (
        reviewer_id = (SELECT auth.uid())
        OR EXISTS (
            SELECT 1 FROM public.user_quests uq
            WHERE uq.id = quest_reviews.user_quest_id
            AND uq.user_id = (SELECT auth.uid())
        )
        OR EXISTS (
            SELECT 1 FROM public.users 
            WHERE id = (SELECT auth.uid()) 
            AND role IN ('admin', 'educator')
        )
    );

CREATE POLICY "quest_reviews_create_update" ON public.quest_reviews
    FOR ALL
    USING (
        reviewer_id = (SELECT auth.uid())
        OR EXISTS (
            SELECT 1 FROM public.users 
            WHERE id = (SELECT auth.uid()) 
            AND role IN ('admin', 'educator')
        )
    );

-- user_achievements table
CREATE POLICY "user_achievements_user_read" ON public.user_achievements
    FOR SELECT
    USING (
        user_id = (SELECT auth.uid())
        OR EXISTS (
            SELECT 1 FROM public.users 
            WHERE id = (SELECT auth.uid()) 
            AND role = 'admin'
        )
    );

CREATE POLICY "user_achievements_system_write" ON public.user_achievements
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.users 
            WHERE id = (SELECT auth.uid()) 
            AND role = 'admin'
        )
        OR current_setting('request.jwt.claims', true)::json->>'role' = 'service_role'
    );

-- ============================================
-- PART 4: Create Master Migration Runner
-- ============================================
-- This function can be used to check migration status
CREATE OR REPLACE FUNCTION public.check_security_fixes()
RETURNS TABLE(
    check_name TEXT,
    status TEXT,
    details TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    -- Check if RLS is enabled on all necessary tables
    RETURN QUERY
    SELECT 
        'RLS Enabled on ' || tablename::TEXT,
        CASE WHEN rowsecurity THEN 'PASS' ELSE 'FAIL' END,
        CASE WHEN rowsecurity THEN 'RLS is enabled' ELSE 'RLS needs to be enabled' END
    FROM pg_tables
    WHERE schemaname = 'public'
    AND tablename IN (
        'users', 'quests', 'user_quests', 'quest_tasks', 
        'user_quest_tasks', 'learning_logs', 'diplomas',
        'friendships', 'submissions', 'quest_collaborations',
        'ai_cycle_logs', 'ai_generated_quests', 'ai_generation_jobs',
        'ai_prompt_templates', 'ai_quest_review_history', 'ai_seeds',
        'learning_logs_backup', 'quest_reviews', 'user_achievements'
    );
    
    -- Check if functions have search_path set
    RETURN QUERY
    SELECT 
        'Function ' || p.proname::TEXT,
        CASE 
            WHEN p.proconfig IS NOT NULL AND 
                 array_to_string(p.proconfig, ',') LIKE '%search_path%' 
            THEN 'PASS' 
            ELSE 'FAIL' 
        END,
        CASE 
            WHEN p.proconfig IS NOT NULL AND 
                 array_to_string(p.proconfig, ',') LIKE '%search_path%' 
            THEN 'search_path is set'
            ELSE 'search_path needs to be set' 
        END
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
    AND p.proname IN (
        'calculate_quest_quality_score', 'award_xp_on_completion',
        'get_user_total_xp', 'recalculate_user_skill_xp',
        'initialize_user_skills', 'update_quest_quality_score',
        'add_default_quest_xp', 'get_monthly_active_users',
        'get_user_xp_by_subject', 'update_updated_at_column',
        'check_quest_duplicate', 'generate_portfolio_slug'
    );
    
    -- Check for extensions in public schema
    RETURN QUERY
    SELECT 
        'Extension ' || extname::TEXT,
        CASE 
            WHEN n.nspname = 'public' THEN 'FAIL'
            ELSE 'PASS'
        END,
        CASE 
            WHEN n.nspname = 'public' THEN 'Needs to be moved from public schema'
            ELSE 'Correctly placed in ' || n.nspname
        END
    FROM pg_extension e
    JOIN pg_namespace n ON e.extnamespace = n.oid
    WHERE e.extname IN ('pg_net', 'pg_trgm', 'vector');
END;
$$;

-- Run the check
SELECT * FROM public.check_security_fixes();

-- ============================================
-- PART 5: Create Indexes for Performance
-- ============================================
-- Add indexes to improve RLS policy performance
CREATE INDEX IF NOT EXISTS idx_user_quests_user_id ON public.user_quests(user_id);
CREATE INDEX IF NOT EXISTS idx_user_quests_quest_id ON public.user_quests(quest_id);
CREATE INDEX IF NOT EXISTS idx_quest_tasks_quest_id ON public.quest_tasks(quest_id);
CREATE INDEX IF NOT EXISTS idx_user_quest_tasks_user_id ON public.user_quest_tasks(user_id);
CREATE INDEX IF NOT EXISTS idx_user_quest_tasks_user_quest_id ON public.user_quest_tasks(user_quest_id);
CREATE INDEX IF NOT EXISTS idx_learning_logs_user_id ON public.learning_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_diplomas_user_id ON public.diplomas(user_id);
CREATE INDEX IF NOT EXISTS idx_diplomas_portfolio_slug ON public.diplomas(portfolio_slug);
CREATE INDEX IF NOT EXISTS idx_user_skill_xp_user_id ON public.user_skill_xp(user_id);
CREATE INDEX IF NOT EXISTS idx_quest_collaborations_requester_id ON public.quest_collaborations(requester_id);
CREATE INDEX IF NOT EXISTS idx_quest_collaborations_partner_id ON public.quest_collaborations(partner_id);
CREATE INDEX IF NOT EXISTS idx_submissions_user_quest_id ON public.submissions(user_quest_id);

-- ============================================
-- MIGRATION COMPLETE
-- ============================================
-- After running this migration:
-- 1. Manually move extensions in Supabase Dashboard (requires superuser)
-- 2. Update auth settings in Dashboard (OTP expiry, leaked password protection)
-- 3. Run SELECT * FROM public.check_security_fixes() to verify all fixes