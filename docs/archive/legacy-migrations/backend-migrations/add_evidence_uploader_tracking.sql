-- Migration: Add evidence uploader tracking columns
-- Date: 2025-01-12
-- Description: Add columns to track who uploaded evidence (student, advisor, or parent)

-- Add uploaded_by_user_id column to evidence_document_blocks
ALTER TABLE evidence_document_blocks
ADD COLUMN IF NOT EXISTS uploaded_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL;

-- Add uploaded_by_role column to evidence_document_blocks
DO $$ BEGIN
    CREATE TYPE evidence_uploader_role AS ENUM ('student', 'advisor', 'parent');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

ALTER TABLE evidence_document_blocks
ADD COLUMN IF NOT EXISTS uploaded_by_role evidence_uploader_role DEFAULT 'student';

-- Add comment for documentation
COMMENT ON COLUMN evidence_document_blocks.uploaded_by_user_id IS 'User who uploaded this evidence block (may differ from document owner)';
COMMENT ON COLUMN evidence_document_blocks.uploaded_by_role IS 'Role of the user who uploaded this evidence block';

-- Create index for querying evidence by uploader
CREATE INDEX IF NOT EXISTS idx_evidence_blocks_uploaded_by ON evidence_document_blocks(uploaded_by_user_id);

-- Backfill existing records: set uploaded_by from document owner
UPDATE evidence_document_blocks eb
SET 
    uploaded_by_user_id = doc.user_id,
    uploaded_by_role = 'student'
FROM user_task_evidence_documents doc
WHERE eb.document_id = doc.id
AND eb.uploaded_by_user_id IS NULL;
