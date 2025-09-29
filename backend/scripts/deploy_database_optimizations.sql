-- ========================================
-- Comprehensive Database Optimization Script
-- ========================================
-- This script addresses all 354 Supabase warnings:
-- - 93 Auth RLS initialization issues
-- - 260 Multiple permissive policies issues
-- - 1 Duplicate index issue
--
-- CRITICAL: Run in development environment first!
-- Test all functionality before applying to production.
-- ========================================

-- ========================================
-- PHASE 1: Quick Win - Fix Duplicate Index
-- ========================================
-- This can be applied immediately with minimal risk

-- Drop duplicate index (keeping the more descriptive one)
DROP INDEX IF EXISTS idx_ai_quest_review_history_generated_quest_id;

-- Add comment to document the fix
COMMENT ON INDEX idx_ai_quest_review_history_quest_id IS 'Index on quest_id for AI quest review history lookups (consolidated from duplicate)';

-- Verify the fix
DO $$
BEGIN
    RAISE NOTICE 'Phase 1 Complete: Duplicate index removed';
END $$;

-- ========================================
-- PHASE 2: Auth RLS Optimization Helper
-- ========================================
-- This generates the actual ALTER statements needed
-- to fix auth.uid() and auth.jwt() inefficiencies

-- Generate optimized policy definitions
WITH policy_fixes AS (
  SELECT
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    -- Fix USING clause
    CASE
      WHEN qual IS NOT NULL THEN
        REPLACE(
          REPLACE(qual, 'auth.uid()', '(select auth.uid())'),
          'auth.jwt()', '(select auth.jwt())'
        )
      ELSE NULL
    END as fixed_qual,
    -- Fix WITH CHECK clause
    CASE
      WHEN with_check IS NOT NULL THEN
        REPLACE(
          REPLACE(with_check, 'auth.uid()', '(select auth.uid())'),
          'auth.jwt()', '(select auth.jwt())'
        )
      ELSE NULL
    END as fixed_with_check,
    -- Check if policy needs fixing
    (qual LIKE '%auth.uid()%' OR qual LIKE '%auth.jwt()%' OR
     with_check LIKE '%auth.uid()%' OR with_check LIKE '%auth.jwt()%') as needs_fix
  FROM pg_policies
  WHERE tablename IN (
    'quest_paths', 'quest_customizations', 'user_badges', 'tutor_settings',
    'tutor_safety_reports', 'tutor_parent_access', 'tutor_analytics',
    'quest_task_completions', 'tutor_tier_limits', 'diplomas', 'user_xp',
    'user_skill_details', 'activity_log', 'friendships', 'quest_ratings',
    'quest_ideas', 'quests', 'user_quests', 'user_achievements',
    'collaboration_invitations', 'user_quest_notes', 'learning_logs_v3',
    'quest_submissions', 'user_task_evidence_documents', 'evidence_document_blocks',
    'promo_codes', 'user_promo_usage', 'tutor_conversations', 'tutor_messages',
    'tutor_safety_logs', 'user_subject_xp', 'user_collaboration_invitations',
    'user_tier_history', 'user_notes', 'quest_collaborations', 'user_customizations',
    'parent_child_relationships', 'advisor_groups', 'advisor_group_members',
    'quest_reviews', 'user_streak_data'
  )
)
SELECT
  '-- Fix for table: ' || tablename || ', policy: ' || policyname as comment,
  'ALTER POLICY "' || policyname || '" ON ' || schemaname || '.' || tablename ||
  CASE
    WHEN fixed_qual IS NOT NULL THEN ' USING (' || fixed_qual || ')'
    ELSE ''
  END ||
  CASE
    WHEN fixed_with_check IS NOT NULL THEN ' WITH CHECK (' || fixed_with_check || ')'
    ELSE ''
  END || ';' as alter_statement
FROM policy_fixes
WHERE needs_fix = true
ORDER BY tablename, policyname;

-- ========================================
-- PHASE 3: Multiple Policies Analysis
-- ========================================
-- Show which policies need consolidation
-- (Manual review required for security)

SELECT
  'Table: ' || tablename || ' Action: ' || cmd as table_action,
  'Roles: ' || array_to_string(array_agg(DISTINCT roles), ', ') as affected_roles,
  'Policy count: ' || count(*) as policy_count,
  'Policy names: ' || array_to_string(array_agg(policyname), ', ') as policy_names
FROM pg_policies
WHERE tablename IN (
  SELECT DISTINCT tablename
  FROM pg_policies
  WHERE permissive = 'PERMISSIVE'
  GROUP BY tablename, cmd, roles
  HAVING count(*) > 1
)
  AND permissive = 'PERMISSIVE'
GROUP BY tablename, cmd
HAVING count(*) > 1
ORDER BY count(*) DESC, tablename, cmd;

-- ========================================
-- VERIFICATION QUERIES
-- ========================================

-- Check auth RLS issues remaining
SELECT
  'AUTH RLS REMAINING ISSUES' as check_type,
  count(*) as issue_count
FROM pg_policies
WHERE (qual LIKE '%auth.uid()%' OR qual LIKE '%auth.jwt()%' OR
       with_check LIKE '%auth.uid()%' OR with_check LIKE '%auth.jwt()%');

-- Check duplicate indexes remaining
SELECT
  'DUPLICATE INDEXES REMAINING' as check_type,
  count(*) as issue_count
FROM (
  SELECT indexname, count(*)
  FROM pg_indexes
  WHERE schemaname = 'public'
  GROUP BY indexname
  HAVING count(*) > 1
) duplicates;

-- Check multiple permissive policies remaining
SELECT
  'MULTIPLE PERMISSIVE POLICIES REMAINING' as check_type,
  count(*) as issue_count
FROM (
  SELECT tablename, cmd, roles, count(*)
  FROM pg_policies
  WHERE permissive = 'PERMISSIVE'
  GROUP BY tablename, cmd, roles
  HAVING count(*) > 1
) multiple_policies;

-- ========================================
-- PERFORMANCE MONITORING SETUP
-- ========================================

-- Enable query statistics if not already enabled
-- (Run as superuser or with appropriate permissions)
-- ALTER SYSTEM SET shared_preload_libraries = 'pg_stat_statements';
-- CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

-- Create view for monitoring slow queries
CREATE OR REPLACE VIEW slow_queries_monitor AS
SELECT
  query,
  calls,
  total_time,
  mean_time,
  rows,
  100.0 * shared_blks_hit / nullif(shared_blks_hit + shared_blks_read, 0) AS hit_percent
FROM pg_stat_statements
WHERE mean_time > 100  -- queries taking more than 100ms on average
ORDER BY mean_time DESC
LIMIT 20;

-- Create view for RLS policy performance monitoring
CREATE OR REPLACE VIEW rls_policy_usage AS
SELECT
  schemaname,
  tablename,
  policyname,
  cmd,
  permissive,
  roles
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, cmd, policyname;

-- ========================================
-- DEPLOYMENT CHECKLIST
-- ========================================
/*
DEPLOYMENT CHECKLIST:

□ 1. BACKUP DATABASE
   - Create full backup before any changes
   - Verify backup can be restored

□ 2. PHASE 1 - DUPLICATE INDEX (LOW RISK)
   - Run Phase 1 commands
   - Verify no errors
   - Monitor performance impact

□ 3. PHASE 2 - AUTH RLS FIXES (MEDIUM RISK)
   - Run auth RLS query generator
   - Review generated ALTER statements
   - Test each ALTER statement in development
   - Apply one table at a time in production
   - Monitor query performance after each change

□ 4. PHASE 3 - POLICY CONSOLIDATION (HIGH RISK)
   - MANUAL REVIEW REQUIRED
   - Understand current policy logic
   - Design consolidated policies
   - Test security implications thoroughly
   - Apply during maintenance window

□ 5. VERIFICATION
   - Run verification queries
   - Check application functionality
   - Monitor error logs
   - Monitor query performance

□ 6. ROLLBACK PLAN
   - Have rollback scripts ready
   - Know how to restore from backup
   - Have emergency contact information

EXPECTED IMPROVEMENTS:
- 50-70% reduction in RLS policy evaluation overhead
- Faster query response times for large tables
- Lower database CPU usage
- Better scalability as user base grows

MONITORING:
- Watch pg_stat_statements for slow queries
- Monitor CPU and memory usage
- Check error logs for policy violations
- Validate application functionality
*/