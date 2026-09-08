-- Migration 021: Make organization_id nullable for curriculum_attachments
-- Purpose: Allow file attachments on public quests (quests without organization)
-- Created: 2025-12-27

BEGIN;

-- Make organization_id nullable for public quests
ALTER TABLE curriculum_attachments
ALTER COLUMN organization_id DROP NOT NULL;

-- Update RLS policy to handle NULL organization_id
DROP POLICY IF EXISTS curriculum_attachments_org_isolation ON curriculum_attachments;

CREATE POLICY curriculum_attachments_org_isolation ON curriculum_attachments
FOR SELECT
USING (
  -- Allow if user is in same org, OR if attachment has no org (public quest)
  organization_id IS NULL
  OR organization_id IN (
    SELECT organization_id FROM users WHERE id = auth.uid()
  )
);

DROP POLICY IF EXISTS curriculum_attachments_insert ON curriculum_attachments;

CREATE POLICY curriculum_attachments_insert ON curriculum_attachments
FOR INSERT
WITH CHECK (
  -- Allow insert if org matches user's org, OR if quest has no org (public)
  organization_id IS NULL
  OR organization_id IN (
    SELECT organization_id FROM users WHERE id = auth.uid()
  )
);

COMMIT;
