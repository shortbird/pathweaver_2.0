-- Move Extensions from Public Schema to Extensions Schema
-- This is a security best practice to isolate extensions from application data
-- NOTE: This migration requires superuser privileges and must be run manually in Supabase Dashboard

-- Create extensions schema if it doesn't exist
CREATE SCHEMA IF NOT EXISTS extensions;
GRANT USAGE ON SCHEMA extensions TO postgres;
GRANT USAGE ON SCHEMA extensions TO anon;
GRANT USAGE ON SCHEMA extensions TO authenticated;
GRANT USAGE ON SCHEMA extensions TO service_role;

-- Instructions for manual migration in Supabase Dashboard:
-- 1. Go to SQL Editor in Supabase Dashboard
-- 2. Run these commands with superuser privileges:

/*
-- Drop existing extensions from public schema
DROP EXTENSION IF EXISTS pg_net CASCADE;
DROP EXTENSION IF EXISTS pg_trgm CASCADE;
DROP EXTENSION IF EXISTS vector CASCADE;

-- Recreate extensions in extensions schema
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;

-- Update search_path for database to include extensions schema
ALTER DATABASE postgres SET search_path TO public, extensions;

-- Grant necessary permissions
GRANT ALL ON ALL TABLES IN SCHEMA extensions TO postgres;
GRANT ALL ON ALL SEQUENCES IN SCHEMA extensions TO postgres;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA extensions TO postgres;
*/

-- Alternative approach if you can't drop/recreate (preserves data):
-- ALTER EXTENSION pg_net SET SCHEMA extensions;
-- ALTER EXTENSION pg_trgm SET SCHEMA extensions;
-- ALTER EXTENSION vector SET SCHEMA extensions;