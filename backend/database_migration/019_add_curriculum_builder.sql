-- Migration 019: Add Curriculum Builder Schema
-- Purpose: Support custom curriculum content within quests (text, embeds, documents)
-- Created: 2025-12-27
-- Part of: LMS Transformation - Custom Curriculum Support

BEGIN;

-- ========================================
-- 1. Add curriculum fields to quests table
-- ========================================

-- Curriculum content stored as structured JSONB
-- Format: { "blocks": [{ "type": "text|iframe|document", "content": "...", "data": {...} }] }
-- Supports markdown text, iframe embeds (videos), and document references
ALTER TABLE quests
ADD COLUMN IF NOT EXISTS curriculum_content JSONB DEFAULT NULL;

-- Version tracking for curriculum changes
ALTER TABLE quests
ADD COLUMN IF NOT EXISTS curriculum_version INTEGER DEFAULT 1;

-- Track who last edited the curriculum (for audit trail)
ALTER TABLE quests
ADD COLUMN IF NOT EXISTS curriculum_last_edited_by UUID REFERENCES users(id);

-- Timestamp for curriculum edits
ALTER TABLE quests
ADD COLUMN IF NOT EXISTS curriculum_last_edited_at TIMESTAMPTZ DEFAULT NULL;

-- Add index for curriculum queries
CREATE INDEX IF NOT EXISTS idx_quests_curriculum_content ON quests USING GIN (curriculum_content);

-- Add index for tracking edits
CREATE INDEX IF NOT EXISTS idx_quests_curriculum_last_edited_by ON quests(curriculum_last_edited_by);

-- ========================================
-- 2. Create curriculum_attachments table
-- ========================================

-- Stores uploaded files (PDFs, docs, images, etc.) for curriculum
CREATE TABLE IF NOT EXISTS curriculum_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Link to quest
  quest_id UUID NOT NULL REFERENCES quests(id) ON DELETE CASCADE,

  -- File metadata
  file_url TEXT NOT NULL,  -- S3/storage URL
  file_name TEXT NOT NULL,  -- Original filename (e.g., "Lesson_Plan.pdf")
  file_type TEXT NOT NULL,  -- MIME type (e.g., "application/pdf", "image/png")
  file_size_bytes INTEGER,  -- File size for quota management

  -- Upload tracking
  uploaded_by UUID NOT NULL REFERENCES users(id),
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Soft delete (for compliance/audit)
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  deleted_at TIMESTAMPTZ DEFAULT NULL,
  deleted_by UUID REFERENCES users(id),

  -- Organization linkage (for multi-tenancy)
  organization_id UUID NOT NULL REFERENCES organizations(id),

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for curriculum_attachments
CREATE INDEX IF NOT EXISTS idx_curriculum_attachments_quest_id ON curriculum_attachments(quest_id);
CREATE INDEX IF NOT EXISTS idx_curriculum_attachments_uploaded_by ON curriculum_attachments(uploaded_by);
CREATE INDEX IF NOT EXISTS idx_curriculum_attachments_organization_id ON curriculum_attachments(organization_id);
CREATE INDEX IF NOT EXISTS idx_curriculum_attachments_is_deleted ON curriculum_attachments(is_deleted);

-- ========================================
-- 3. Row-Level Security (RLS) for curriculum_attachments
-- ========================================

-- Enable RLS
ALTER TABLE curriculum_attachments ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see attachments from their own organization
CREATE POLICY curriculum_attachments_org_isolation ON curriculum_attachments
FOR SELECT
USING (
  organization_id IN (
    SELECT organization_id FROM users WHERE id = auth.uid()
  )
);

-- Policy: Teachers/admins can insert attachments for their org's quests
CREATE POLICY curriculum_attachments_insert ON curriculum_attachments
FOR INSERT
WITH CHECK (
  organization_id IN (
    SELECT organization_id FROM users WHERE id = auth.uid()
  )
  AND quest_id IN (
    SELECT id FROM quests WHERE organization_id = curriculum_attachments.organization_id
  )
);

-- Policy: Teachers/admins can update/delete their attachments
CREATE POLICY curriculum_attachments_update ON curriculum_attachments
FOR UPDATE
USING (
  uploaded_by = auth.uid()
  OR EXISTS (
    SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('teacher', 'admin', 'superadmin')
  )
);

-- Policy: Soft delete only (for audit trail)
CREATE POLICY curriculum_attachments_delete ON curriculum_attachments
FOR DELETE
USING (
  uploaded_by = auth.uid()
  OR EXISTS (
    SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('teacher', 'admin', 'superadmin')
  )
);

-- ========================================
-- 4. Updated_at trigger for curriculum_attachments
-- ========================================

-- Create trigger to auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_curriculum_attachments_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_curriculum_attachments_updated_at
BEFORE UPDATE ON curriculum_attachments
FOR EACH ROW
EXECUTE FUNCTION update_curriculum_attachments_updated_at();

-- ========================================
-- 5. Comments for documentation
-- ========================================

COMMENT ON COLUMN quests.curriculum_content IS 'Structured JSONB curriculum content: { "blocks": [{ "type": "text|iframe|document", "content": "...", "data": {...} }] }';
COMMENT ON COLUMN quests.curriculum_version IS 'Increments on each curriculum edit (for version control)';
COMMENT ON COLUMN quests.curriculum_last_edited_by IS 'User who last edited the curriculum content';
COMMENT ON COLUMN quests.curriculum_last_edited_at IS 'Timestamp of last curriculum edit';

COMMENT ON TABLE curriculum_attachments IS 'Uploaded files (PDFs, docs, images) for quest curriculum';
COMMENT ON COLUMN curriculum_attachments.file_url IS 'S3 or storage URL for the uploaded file';
COMMENT ON COLUMN curriculum_attachments.file_name IS 'Original filename displayed to users';
COMMENT ON COLUMN curriculum_attachments.file_type IS 'MIME type (application/pdf, image/png, etc.)';
COMMENT ON COLUMN curriculum_attachments.is_deleted IS 'Soft delete flag (preserves audit trail)';

COMMIT;
