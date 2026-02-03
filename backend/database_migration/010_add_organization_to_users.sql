-- Migration 010: Add Organization Fields to Users Table
-- Purpose: Link users to organizations for multi-org support
-- Created: 2025-12-07
-- Part of: Multi-Organization Implementation Phase 1

BEGIN;

-- Add organization_id column
ALTER TABLE users
ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);

-- Add is_org_admin column
ALTER TABLE users
ADD COLUMN IF NOT EXISTS is_org_admin BOOLEAN DEFAULT false;

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_users_organization_id ON users(organization_id);
CREATE INDEX IF NOT EXISTS idx_users_is_org_admin ON users(is_org_admin) WHERE is_org_admin = true;

-- Assign all existing users to Optio organization
UPDATE users
SET organization_id = (SELECT id FROM organizations WHERE slug = 'optio')
WHERE organization_id IS NULL;

-- Make organization_id NOT NULL after backfill
ALTER TABLE users ALTER COLUMN organization_id SET NOT NULL;

COMMIT;
