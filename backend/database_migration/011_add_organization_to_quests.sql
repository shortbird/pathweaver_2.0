-- Migration 011: Add Organization Fields to Quests Table
-- Purpose: Allow quests to be global (NULL) or organization-specific
-- Created: 2025-12-07
-- Part of: Multi-Organization Implementation Phase 1

BEGIN;

-- Add organization_id column (NULLABLE for global quests)
ALTER TABLE quests
ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_quests_organization_id ON quests(organization_id);

-- Mark all existing quests as global Optio quests (organization_id = NULL)
-- This keeps existing quest library available to all orgs with 'all_optio' policy
-- NULL = global quest visible to organizations with 'all_optio' policy

-- Alternative option (commented out): Assign existing quests to Optio organization
-- Uncomment below if you want existing quests to belong to Optio org instead of being global
-- UPDATE quests
-- SET organization_id = (SELECT id FROM organizations WHERE slug = 'optio')
-- WHERE organization_id IS NULL;

COMMIT;
