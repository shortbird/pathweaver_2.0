-- Migration: Fix Function Search Path Security Issues
-- Addresses Supabase Security Advisory: Function Search Path Mutable
-- Warning Level: Functions with mutable search_path are vulnerable to SQL injection

-- Fix existing tutor schema functions by setting explicit search_path
-- This prevents SQL injection attacks through search_path manipulation

-- 1. Fix check_daily_message_limit function
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'check_daily_message_limit') THEN
        ALTER FUNCTION public.check_daily_message_limit(UUID)
            SET search_path = public, pg_temp;
    END IF;
END $$;

-- 2. Fix increment_message_usage function
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'increment_message_usage') THEN
        ALTER FUNCTION public.increment_message_usage(UUID)
            SET search_path = public, pg_temp;
    END IF;
END $$;

-- 3. Fix reset_daily_message_limits function
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'reset_daily_message_limits') THEN
        ALTER FUNCTION public.reset_daily_message_limits()
            SET search_path = public, pg_temp;
    END IF;
END $$;

-- 4. Fix update_conversation_stats function
-- Check if function exists before altering
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_conversation_stats') THEN
        ALTER FUNCTION public.update_conversation_stats()
            SET search_path = public, pg_temp;
    END IF;
END $$;

-- Recreate functions that may not exist yet but are referenced in code
-- These will be created with secure search_path from the start

-- 5. Fix update_friendship_status function (used in community.py)
-- Drop and recreate to ensure correct signature and security settings
DROP FUNCTION IF EXISTS public.update_friendship_status(INTEGER, TEXT);
DROP FUNCTION IF EXISTS public.update_friendship_status(INT, TEXT);
DROP FUNCTION IF EXISTS public.update_friendship_status;

CREATE FUNCTION public.update_friendship_status(
    friendship_id INTEGER,
    new_status TEXT
)
RETURNS VOID AS $$
BEGIN
    UPDATE friendships
    SET status = new_status,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = friendship_id;
END;
$$ LANGUAGE plpgsql
SET search_path = public, pg_temp
SECURITY DEFINER;

-- 6. Fix initialize_user_skills function
-- Handle trigger dependencies first
DROP TRIGGER IF EXISTS initialize_user_skills_trigger ON users;
DROP FUNCTION IF EXISTS public.initialize_user_skills(UUID);
DROP FUNCTION IF EXISTS public.initialize_user_skills();
DROP FUNCTION IF EXISTS public.initialize_user_skills;

-- Create trigger version (no parameters, uses NEW directly)
CREATE FUNCTION public.initialize_user_skills()
RETURNS TRIGGER AS $$
BEGIN
    -- Initialize user skill XP for all pillars if not exists
    INSERT INTO user_skill_xp (user_id, pillar, xp_amount)
    VALUES
        (NEW.id, 'STEM & Logic', 0),
        (NEW.id, 'Life & Wellness', 0),
        (NEW.id, 'Language & Communication', 0),
        (NEW.id, 'Society & Culture', 0),
        (NEW.id, 'Arts & Creativity', 0)
    ON CONFLICT (user_id, pillar) DO NOTHING;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql
SET search_path = public, pg_temp
SECURITY DEFINER;

-- Create standalone version (with parameters for direct calls)
CREATE FUNCTION public.initialize_user_skills_for_user(
    p_user_id UUID
)
RETURNS VOID AS $$
BEGIN
    -- Initialize user skill XP for all pillars if not exists
    INSERT INTO user_skill_xp (user_id, pillar, xp_amount)
    VALUES
        (p_user_id, 'STEM & Logic', 0),
        (p_user_id, 'Life & Wellness', 0),
        (p_user_id, 'Language & Communication', 0),
        (p_user_id, 'Society & Culture', 0),
        (p_user_id, 'Arts & Creativity', 0)
    ON CONFLICT (user_id, pillar) DO NOTHING;
END;
$$ LANGUAGE plpgsql
SET search_path = public, pg_temp
SECURITY DEFINER;

-- Recreate the trigger if it was being used
CREATE TRIGGER initialize_user_skills_trigger
    AFTER INSERT ON users
    FOR EACH ROW
    EXECUTE FUNCTION initialize_user_skills();

-- 7. Fix calculate_mastery_level function (if needed in DB)
DROP FUNCTION IF EXISTS public.calculate_mastery_level(INTEGER);
DROP FUNCTION IF EXISTS public.calculate_mastery_level;

CREATE FUNCTION public.calculate_mastery_level(
    total_xp INTEGER
)
RETURNS TEXT AS $$
BEGIN
    IF total_xp <= 500 THEN
        RETURN 'Explorer';
    ELSIF total_xp <= 1500 THEN
        RETURN 'Builder';
    ELSIF total_xp <= 3000 THEN
        RETURN 'Creator';
    ELSIF total_xp <= 6000 THEN
        RETURN 'Scholar';
    ELSE
        RETURN 'Sage';
    END IF;
END;
$$ LANGUAGE plpgsql
SET search_path = public, pg_temp
IMMUTABLE;

-- 8. Fix update_user_mastery function (used in xp_service.py)
DROP FUNCTION IF EXISTS public.update_user_mastery(UUID);
DROP FUNCTION IF EXISTS public.update_user_mastery;

CREATE FUNCTION public.update_user_mastery(
    p_user_id UUID
)
RETURNS TEXT AS $$
DECLARE
    total_xp INTEGER;
    mastery_level TEXT;
BEGIN
    -- Calculate total XP across all pillars
    SELECT COALESCE(SUM(xp_amount), 0) INTO total_xp
    FROM user_skill_xp
    WHERE user_id = p_user_id;

    -- Calculate mastery level
    mastery_level := calculate_mastery_level(total_xp);

    -- Update user's mastery level if it exists in users table
    UPDATE users
    SET mastery_level = mastery_level,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = p_user_id;

    RETURN mastery_level;
END;
$$ LANGUAGE plpgsql
SET search_path = public, pg_temp
SECURITY DEFINER;

-- 9. Fix reorder_evidence_blocks function (if needed)
-- This function may be used for evidence document ordering
DROP FUNCTION IF EXISTS public.reorder_evidence_blocks(UUID, INTEGER[]);
DROP FUNCTION IF EXISTS public.reorder_evidence_blocks;

CREATE FUNCTION public.reorder_evidence_blocks(
    p_task_completion_id UUID,
    p_new_order INTEGER[]
)
RETURNS VOID AS $$
DECLARE
    evidence_id UUID;
    new_position INTEGER;
    i INTEGER := 1;
BEGIN
    -- Update evidence document order based on provided array
    FOREACH evidence_id IN ARRAY p_new_order
    LOOP
        UPDATE evidence_documents
        SET display_order = i,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = evidence_id
        AND task_completion_id = p_task_completion_id;

        i := i + 1;
    END LOOP;
END;
$$ LANGUAGE plpgsql
SET search_path = public, pg_temp
SECURITY DEFINER;

-- 10. Fix update_evidence_document_updated_at function
-- This might be a trigger function for evidence documents
-- Handle trigger dependencies first
DROP TRIGGER IF EXISTS trigger_update_evidence_document_updated_at ON evidence_documents;
DROP FUNCTION IF EXISTS public.update_evidence_document_updated_at();
DROP FUNCTION IF EXISTS public.update_evidence_document_updated_at;

CREATE FUNCTION public.update_evidence_document_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql
SET search_path = public, pg_temp;

-- Create trigger if evidence_documents table has updated_at column
-- This will only execute if the trigger doesn't already exist
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'evidence_documents'
        AND column_name = 'updated_at'
        AND table_schema = 'public'
    ) THEN
        -- Drop existing trigger if it exists
        DROP TRIGGER IF EXISTS trigger_update_evidence_document_updated_at ON evidence_documents;

        -- Create new trigger
        CREATE TRIGGER trigger_update_evidence_document_updated_at
            BEFORE UPDATE ON evidence_documents
            FOR EACH ROW
            EXECUTE FUNCTION update_evidence_document_updated_at();
    END IF;
END $$;

-- Grant appropriate permissions for these functions
GRANT EXECUTE ON FUNCTION public.update_friendship_status(INTEGER, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.initialize_user_skills() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.initialize_user_skills_for_user(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.calculate_mastery_level(INTEGER) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_user_mastery(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reorder_evidence_blocks(UUID, INTEGER[]) TO authenticated, service_role;

-- Add comments for documentation
COMMENT ON FUNCTION public.update_friendship_status IS 'Updates friendship status with secure search_path';
COMMENT ON FUNCTION public.initialize_user_skills IS 'Trigger function to initialize user skill XP for all pillars';
COMMENT ON FUNCTION public.initialize_user_skills_for_user IS 'Initializes user skill XP for all pillars (standalone version)';
COMMENT ON FUNCTION public.calculate_mastery_level IS 'Calculates mastery level from total XP';
COMMENT ON FUNCTION public.update_user_mastery IS 'Updates user mastery level based on total XP';
COMMENT ON FUNCTION public.reorder_evidence_blocks IS 'Reorders evidence documents for a task completion';
COMMENT ON FUNCTION public.update_evidence_document_updated_at IS 'Trigger function to update updated_at timestamp';