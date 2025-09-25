-- Migration: Fix tutor_tier_limits RLS (CRITICAL)
-- Addresses Supabase Security Advisory: RLS Disabled in Public
-- Error Level: CRITICAL - tutor_tier_limits table is public but RLS is not enabled

-- Enable Row Level Security on tutor_tier_limits table
ALTER TABLE tutor_tier_limits ENABLE ROW LEVEL SECURITY;

-- Create policy to allow all authenticated users to read tier limits
-- This is needed for the application to function - users need to see their tier limits
CREATE POLICY "All users can view tier limits" ON tutor_tier_limits
    FOR SELECT USING (true);

-- Only allow service role to modify tier limits (admin operations only)
-- This prevents regular users from modifying subscription tier configurations
CREATE POLICY "Service role can modify tier limits" ON tutor_tier_limits
    FOR ALL USING (auth.role() = 'service_role');

-- Grant explicit permissions to ensure functionality is preserved
GRANT SELECT ON tutor_tier_limits TO authenticated;
GRANT ALL ON tutor_tier_limits TO service_role;

-- Add comment for future reference
COMMENT ON TABLE tutor_tier_limits IS 'Subscription tier limits with RLS enabled. All users can read, only service role can modify.';