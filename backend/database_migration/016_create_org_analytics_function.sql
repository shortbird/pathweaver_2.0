-- Migration 016: Create organization analytics RPC function
-- Created: 2025-12-07
-- Purpose: Add function to calculate total XP for an organization

-- Create function to get total XP for an organization
CREATE OR REPLACE FUNCTION get_org_total_xp(org_id_param UUID)
RETURNS BIGINT AS $$
    SELECT COALESCE(SUM(total_xp), 0)
    FROM users
    WHERE organization_id = org_id_param;
$$ LANGUAGE SQL SECURITY DEFINER;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION get_org_total_xp(UUID) TO authenticated;
