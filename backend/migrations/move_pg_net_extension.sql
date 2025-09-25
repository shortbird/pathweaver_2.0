-- Migration: Move pg_net Extension from Public Schema
-- Addresses Supabase Security Advisory: Extension in Public
-- Warning Level: Extensions should not be in public schema for security

-- Create dedicated schema for extensions if it doesn't exist
CREATE SCHEMA IF NOT EXISTS extensions;

-- Move pg_net extension from public schema to extensions schema
-- This improves security by isolating extensions from user tables
ALTER EXTENSION pg_net SET SCHEMA extensions;

-- Grant necessary permissions to maintain functionality
-- Only postgres superuser and service roles should have access to extensions
GRANT USAGE ON SCHEMA extensions TO postgres;
GRANT USAGE ON SCHEMA extensions TO service_role;

-- Update search path for any functions that might use pg_net
-- This ensures they can still find the extension functions
DO $$
DECLARE
    func_record RECORD;
BEGIN
    -- Find all functions that might reference pg_net
    FOR func_record IN
        SELECT p.proname, n.nspname, pg_get_functiondef(p.oid) as def
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE pg_get_functiondef(p.oid) LIKE '%pg_net%'
        AND n.nspname = 'public'
    LOOP
        -- Update search path for functions that use pg_net
        EXECUTE format('ALTER FUNCTION %I.%I SET search_path = public, extensions, pg_temp',
                      func_record.nspname, func_record.proname);
    END LOOP;
END $$;

-- Add comment for documentation
COMMENT ON SCHEMA extensions IS 'Schema for PostgreSQL extensions, isolated from public schema for security';

-- Note: After this migration, if any code references pg_net functions directly,
-- they may need to be updated to use extensions.pg_net or have the extensions
-- schema added to their search_path