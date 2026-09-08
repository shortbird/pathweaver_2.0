-- Migration 014: Update Quest RLS Policies for Organization Visibility
-- Purpose: Implement organization-aware quest filtering based on visibility policies
-- Created: 2025-12-07
-- Part of: Multi-Organization Implementation Phase 1

BEGIN;

-- Drop existing quest RLS policies
DROP POLICY IF EXISTS "users_can_view_quests" ON quests;
DROP POLICY IF EXISTS "users_can_create_quests" ON quests;
DROP POLICY IF EXISTS "users_can_update_own_quests" ON quests;

-- Create helper function to check quest visibility based on org policy
CREATE OR REPLACE FUNCTION quest_visible_to_user(quest_id_param UUID, user_id_param UUID)
RETURNS BOOLEAN AS $$
DECLARE
    user_org_id UUID;
    user_org_policy VARCHAR(50);
    quest_org_id UUID;
BEGIN
    -- Get user's organization and policy
    SELECT organization_id, organizations.quest_visibility_policy
    INTO user_org_id, user_org_policy
    FROM users
    LEFT JOIN organizations ON users.organization_id = organizations.id
    WHERE users.id = user_id_param;

    -- If user has no organization, deny access
    IF user_org_id IS NULL THEN
        RETURN FALSE;
    END IF;

    -- Get quest's organization (NULL = global Optio quest)
    SELECT organization_id INTO quest_org_id
    FROM quests WHERE id = quest_id_param;

    -- Apply visibility policy logic
    IF user_org_policy = 'all_optio' THEN
        -- See global Optio quests (NULL) + same organization quests
        RETURN (quest_org_id IS NULL OR quest_org_id = user_org_id);

    ELSIF user_org_policy = 'curated' THEN
        -- See curated quests + same organization quests
        RETURN (
            quest_org_id = user_org_id
            OR EXISTS (
                SELECT 1 FROM organization_quest_access
                WHERE organization_id = user_org_id
                AND quest_id = quest_id_param
            )
        );

    ELSIF user_org_policy = 'private_only' THEN
        -- See only same organization quests
        RETURN quest_org_id = user_org_id;

    ELSE
        -- Unknown policy: deny access
        RETURN FALSE;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create new RLS policy for quest viewing
CREATE POLICY "users_can_view_quests_by_org_policy" ON quests
    FOR SELECT
    USING (
        is_active = true
        AND (
            -- User's own quests (always visible)
            created_by = auth.uid()
            OR
            -- Organization policy check
            quest_visible_to_user(id, auth.uid())
        )
    );

-- RLS policy for quest creation (unchanged)
CREATE POLICY "users_can_create_quests" ON quests
    FOR INSERT
    WITH CHECK (created_by = auth.uid());

-- RLS policy for quest updates (users can update own quests)
CREATE POLICY "users_can_update_own_quests" ON quests
    FOR UPDATE
    USING (created_by = auth.uid())
    WITH CHECK (created_by = auth.uid());

-- RLS policy for org admins to update their organization's quests
CREATE POLICY "org_admins_can_update_org_quests" ON quests
    FOR UPDATE
    USING (
        organization_id IN (
            SELECT organization_id
            FROM users
            WHERE id = auth.uid()
            AND (is_org_admin = true OR role = 'admin')
        )
    )
    WITH CHECK (
        organization_id IN (
            SELECT organization_id
            FROM users
            WHERE id = auth.uid()
            AND (is_org_admin = true OR role = 'admin')
        )
    );

COMMIT;
