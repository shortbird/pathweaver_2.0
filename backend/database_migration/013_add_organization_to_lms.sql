-- Migration 013: Add Organization to LMS Integrations
-- Purpose: Link LMS integrations to specific organizations
-- Created: 2025-12-07
-- Part of: Multi-Organization Implementation Phase 1

BEGIN;

-- Add organization_id to lms_integrations table
ALTER TABLE lms_integrations
ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);

-- Create index
CREATE INDEX IF NOT EXISTS idx_lms_integrations_organization_id ON lms_integrations(organization_id);

-- Assign existing LMS integration to Optio organization
-- (OnFire Learning SPARK integration should belong to Optio for now)
UPDATE lms_integrations
SET organization_id = (SELECT id FROM organizations WHERE slug = 'optio')
WHERE organization_id IS NULL;

-- Make organization_id NOT NULL after backfill
ALTER TABLE lms_integrations ALTER COLUMN organization_id SET NOT NULL;

COMMIT;
