-- Move Extensions to extensions schema
-- Note: pg_net does not support SET SCHEMA, so we'll handle it differently

-- Create extensions schema if it doesn't exist
CREATE SCHEMA IF NOT EXISTS extensions;
GRANT USAGE ON SCHEMA extensions TO postgres;
GRANT USAGE ON SCHEMA extensions TO anon;
GRANT USAGE ON SCHEMA extensions TO authenticated;
GRANT USAGE ON SCHEMA extensions TO service_role;

-- Move pg_trgm extension (supports SET SCHEMA)
DO $$
BEGIN
    ALTER EXTENSION pg_trgm SET SCHEMA extensions;
    RAISE NOTICE 'Moved pg_trgm to extensions schema';
EXCEPTION 
    WHEN OTHERS THEN
        RAISE NOTICE 'Could not move pg_trgm: %', SQLERRM;
END $$;

-- Move vector extension (supports SET SCHEMA)
DO $$
BEGIN
    ALTER EXTENSION vector SET SCHEMA extensions;
    RAISE NOTICE 'Moved vector to extensions schema';
EXCEPTION 
    WHEN OTHERS THEN
        RAISE NOTICE 'Could not move vector: %', SQLERRM;
END $$;

-- For pg_net: It doesn't support SET SCHEMA
-- The extension must be dropped and recreated in the new schema
-- WARNING: This will drop all pg_net dependent objects!

-- Option 1: Leave pg_net in public schema (RECOMMENDED)
-- pg_net is typically only used by service role functions, so it's less of a security concern

-- Option 2: Recreate pg_net in extensions schema (RISKY - may break Supabase features)
-- Only uncomment if you're certain no Supabase features depend on pg_net
/*
DO $$
BEGIN
    -- Check if any objects depend on pg_net
    IF NOT EXISTS (
        SELECT 1 
        FROM pg_depend d
        JOIN pg_extension e ON d.objid = e.oid
        WHERE e.extname = 'pg_net'
        AND d.deptype = 'e'
    ) THEN
        DROP EXTENSION IF EXISTS pg_net CASCADE;
        CREATE EXTENSION pg_net WITH SCHEMA extensions;
        RAISE NOTICE 'Recreated pg_net in extensions schema';
    ELSE
        RAISE NOTICE 'pg_net has dependencies, leaving in public schema';
    END IF;
EXCEPTION 
    WHEN OTHERS THEN
        RAISE NOTICE 'Could not move pg_net: %', SQLERRM;
END $$;
*/

-- Update search_path to include extensions schema
ALTER DATABASE postgres SET search_path TO public, extensions;

-- Verify what extensions are where
SELECT 
    e.extname AS extension_name,
    n.nspname AS schema_name,
    CASE 
        WHEN n.nspname = 'public' THEN 'Should be moved'
        WHEN n.nspname = 'extensions' THEN 'Correctly placed'
        ELSE 'Other schema'
    END AS status
FROM pg_extension e
JOIN pg_namespace n ON e.extnamespace = n.oid
WHERE e.extname IN ('pg_net', 'pg_trgm', 'vector')
ORDER BY e.extname;