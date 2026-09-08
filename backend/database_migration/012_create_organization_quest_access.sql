-- Migration 012: Create Organization Quest Access Table
-- Purpose: Allow organizations with 'curated' policy to select specific quests
-- Created: 2025-12-07
-- Part of: Multi-Organization Implementation Phase 1

BEGIN;

-- Create organization_quest_access table for curated policy
CREATE TABLE IF NOT EXISTS organization_quest_access (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    quest_id UUID NOT NULL REFERENCES quests(id) ON DELETE CASCADE,
    granted_at TIMESTAMPTZ DEFAULT NOW(),
    granted_by UUID REFERENCES users(id),

    -- Prevent duplicate grants
    UNIQUE(organization_id, quest_id)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_org_quest_access_org ON organization_quest_access(organization_id);
CREATE INDEX IF NOT EXISTS idx_org_quest_access_quest ON organization_quest_access(quest_id);
CREATE INDEX IF NOT EXISTS idx_org_quest_access_composite ON organization_quest_access(organization_id, quest_id);

-- Enable RLS
ALTER TABLE organization_quest_access ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can view quest access for their organization
CREATE POLICY "users_can_view_org_quest_access" ON organization_quest_access
    FOR SELECT
    USING (
        organization_id IN (
            SELECT organization_id FROM users WHERE id = auth.uid()
        )
    );

-- RLS Policy: Org admins can manage quest access for their organization
CREATE POLICY "org_admins_can_manage_quest_access" ON organization_quest_access
    FOR ALL
    USING (
        organization_id IN (
            SELECT organization_id
            FROM users
            WHERE id = auth.uid()
            AND (is_org_admin = true OR role = 'admin')
        )
    );

COMMIT;
