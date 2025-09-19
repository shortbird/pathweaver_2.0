-- Security Migration Part 2: Fix Remaining Function Warnings
-- Addresses 6 remaining function search_path warnings from Supabase linter
-- Date: 2025-09-19

-- =============================================================================
-- PHASE 1: Fix Remaining Test/Debug Functions
-- =============================================================================

-- Drop and recreate test functions to fix return types and add search_path security

-- Fix test_login_access function
DROP FUNCTION IF EXISTS test_login_access();
CREATE OR REPLACE FUNCTION test_login_access()
RETURNS TEXT
SET search_path = ''
AS $$
BEGIN
    -- Test function to verify login access
    IF auth.uid() IS NOT NULL THEN
        RETURN 'User is authenticated: ' || auth.uid()::text;
    ELSE
        RETURN 'User is not authenticated';
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Fix test_users_table_access function
DROP FUNCTION IF EXISTS test_users_table_access();
CREATE OR REPLACE FUNCTION test_users_table_access()
RETURNS TEXT
SET search_path = ''
AS $$
DECLARE
    user_count INTEGER;
BEGIN
    -- Test function to verify users table access
    SELECT COUNT(*) INTO user_count FROM public.users;
    RETURN 'Users table accessible. Count: ' || user_count::text;
EXCEPTION
    WHEN OTHERS THEN
        RETURN 'Users table access failed: ' || SQLERRM;
END;
$$ LANGUAGE plpgsql;

-- Fix test_railway_connection function
DROP FUNCTION IF EXISTS test_railway_connection();
CREATE OR REPLACE FUNCTION test_railway_connection()
RETURNS TEXT
SET search_path = ''
AS $$
BEGIN
    -- Test function to verify database connection
    RETURN 'Database connection successful at ' || NOW()::text;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- PHASE 2: Fix Production Functions (may have duplicates/variations)
-- =============================================================================

-- Fix update_user_mastery function (if it exists as separate from trigger)
DROP FUNCTION IF EXISTS update_user_mastery(UUID);
CREATE OR REPLACE FUNCTION update_user_mastery(p_user_id UUID)
RETURNS VOID
SET search_path = ''
AS $$
BEGIN
    -- Update user mastery levels based on total XP
    INSERT INTO public.user_mastery (user_id, total_xp, mastery_level, last_updated)
    VALUES (
        p_user_id,
        public.get_user_total_xp(p_user_id),
        public.calculate_mastery_level(public.get_user_total_xp(p_user_id)),
        NOW()
    )
    ON CONFLICT (user_id) DO UPDATE SET
        total_xp = public.get_user_total_xp(p_user_id),
        mastery_level = public.calculate_mastery_level(public.get_user_total_xp(p_user_id)),
        last_updated = NOW();
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- PHASE 3: Address Duplicate Function Warnings
-- =============================================================================

-- Re-create calculate_mastery_level to ensure it has search_path security
-- (This may appear as duplicate in warnings if there are multiple versions)
CREATE OR REPLACE FUNCTION calculate_mastery_level(total_xp BIGINT)
RETURNS INTEGER
SET search_path = ''
AS $$
BEGIN
    CASE
        WHEN total_xp <= 500 THEN RETURN 1;
        WHEN total_xp <= 1500 THEN RETURN 2;
        WHEN total_xp <= 3500 THEN RETURN 3;
        WHEN total_xp <= 7000 THEN RETURN 4;
        WHEN total_xp <= 12500 THEN RETURN 5;
        WHEN total_xp <= 20000 THEN RETURN 6;
        WHEN total_xp <= 30000 THEN RETURN 7;
        WHEN total_xp <= 45000 THEN RETURN 8;
        WHEN total_xp <= 65000 THEN RETURN 9;
        WHEN total_xp <= 90000 THEN RETURN 10;
        WHEN total_xp <= 120000 THEN RETURN 11;
        WHEN total_xp <= 160000 THEN RETURN 12;
        ELSE RETURN 13 + ((total_xp - 160000) / 40000)::INTEGER;
    END CASE;
END;
$$ LANGUAGE plpgsql;

-- Re-create initialize_user_skills to ensure it has search_path security
CREATE OR REPLACE FUNCTION initialize_user_skills(p_user_id UUID)
RETURNS VOID
SET search_path = ''
AS $$
DECLARE
    pillar_val public.pillar_type;
BEGIN
    -- Initialize XP for all pillars if they don't exist
    FOR pillar_val IN SELECT unnest(enum_range(NULL::public.pillar_type))
    LOOP
        INSERT INTO public.user_skill_xp (user_id, pillar, xp_amount)
        VALUES (p_user_id, pillar_val, 0)
        ON CONFLICT (user_id, pillar) DO NOTHING;
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- PHASE 4: Documentation for Infrastructure Warnings
-- =============================================================================

-- Create documentation table for remaining infrastructure warnings
CREATE TABLE IF NOT EXISTS public.security_warnings_documentation (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    warning_type VARCHAR(100) NOT NULL,
    description TEXT NOT NULL,
    required_action TEXT NOT NULL,
    responsible_party VARCHAR(50) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS on documentation table
ALTER TABLE public.security_warnings_documentation ENABLE ROW LEVEL SECURITY;

-- Policy: Admins can manage, public can read
CREATE POLICY "Public read access to security documentation" ON public.security_warnings_documentation
    FOR SELECT USING (true);

CREATE POLICY "Only admins can manage security documentation" ON public.security_warnings_documentation
    FOR ALL USING (
        EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
    );

-- Document remaining infrastructure warnings
INSERT INTO public.security_warnings_documentation (warning_type, description, required_action, responsible_party)
VALUES
(
    'extension_in_public',
    'Extension pg_net is installed in the public schema. This can pose security risks.',
    'Move pg_net extension to a separate schema (e.g., extensions). This requires Supabase admin access via support ticket.',
    'Supabase Admin'
),
(
    'vulnerable_postgres_version',
    'Current PostgreSQL version (supabase-postgres-17.4.1.074) has outstanding security patches available.',
    'Upgrade PostgreSQL database to the latest version with security patches. This is managed by Supabase.',
    'Supabase Platform'
)
ON CONFLICT DO NOTHING;

-- =============================================================================
-- PHASE 5: Comments and Summary
-- =============================================================================

-- Add comments for additional security improvements
COMMENT ON FUNCTION test_login_access() IS 'Test function with search_path security';
COMMENT ON FUNCTION test_users_table_access() IS 'Test function with search_path security';
COMMENT ON FUNCTION test_railway_connection() IS 'Test function with search_path security';
COMMENT ON FUNCTION update_user_mastery(UUID) IS 'User mastery function with search_path security';
COMMENT ON TABLE security_warnings_documentation IS 'Documentation for infrastructure security warnings requiring Supabase admin action';

-- Security migration part 2 completed
-- This migration addresses:
-- ✓ 6 remaining function search_path warnings by adding SET search_path = ''
-- ✓ Documents 2 infrastructure warnings requiring Supabase admin action
-- ✓ Maintains all existing functionality while improving security posture
-- ✓ Creates documentation system for tracking unresolved warnings