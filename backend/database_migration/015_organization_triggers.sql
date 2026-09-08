-- Migration 015: Create Updated Timestamp Trigger for Organizations
-- Purpose: Automatically update updated_at timestamp on organization changes
-- Created: 2025-12-07
-- Part of: Multi-Organization Implementation Phase 1

BEGIN;

-- Create updated_at trigger function (if not exists)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add trigger to organizations table
DROP TRIGGER IF EXISTS update_organizations_updated_at ON organizations;
CREATE TRIGGER update_organizations_updated_at
    BEFORE UPDATE ON organizations
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

COMMIT;
