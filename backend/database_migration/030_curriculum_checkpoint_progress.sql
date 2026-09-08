-- Migration 030: Add checkpoint and progress tracking to curriculum_uploads
-- Supports: resume on failure, progress streaming, review gates
-- Created: January 2026

-- Stage completion tracking
ALTER TABLE curriculum_uploads ADD COLUMN IF NOT EXISTS current_stage INTEGER DEFAULT 0;
ALTER TABLE curriculum_uploads ADD COLUMN IF NOT EXISTS stage_1_completed_at TIMESTAMPTZ;
ALTER TABLE curriculum_uploads ADD COLUMN IF NOT EXISTS stage_2_completed_at TIMESTAMPTZ;
ALTER TABLE curriculum_uploads ADD COLUMN IF NOT EXISTS stage_3_completed_at TIMESTAMPTZ;
ALTER TABLE curriculum_uploads ADD COLUMN IF NOT EXISTS stage_4_completed_at TIMESTAMPTZ;

-- Resume capability
ALTER TABLE curriculum_uploads ADD COLUMN IF NOT EXISTS can_resume BOOLEAN DEFAULT false;
ALTER TABLE curriculum_uploads ADD COLUMN IF NOT EXISTS resume_from_stage INTEGER;

-- Progress tracking
ALTER TABLE curriculum_uploads ADD COLUMN IF NOT EXISTS progress_percent INTEGER DEFAULT 0;
ALTER TABLE curriculum_uploads ADD COLUMN IF NOT EXISTS current_stage_name TEXT;
ALTER TABLE curriculum_uploads ADD COLUMN IF NOT EXISTS current_item TEXT;
ALTER TABLE curriculum_uploads ADD COLUMN IF NOT EXISTS stage_progress JSONB DEFAULT '{}';

-- Human review edits
ALTER TABLE curriculum_uploads ADD COLUMN IF NOT EXISTS human_structure_edits JSONB;

-- Index for finding resumable uploads
CREATE INDEX IF NOT EXISTS idx_curriculum_uploads_can_resume
    ON curriculum_uploads(can_resume, uploaded_by)
    WHERE can_resume = true;

-- Index for progress polling (frequently queried)
CREATE INDEX IF NOT EXISTS idx_curriculum_uploads_progress
    ON curriculum_uploads(id, status, progress_percent);

-- Comments for documentation
COMMENT ON COLUMN curriculum_uploads.current_stage IS 'Last completed stage (1-4)';
COMMENT ON COLUMN curriculum_uploads.can_resume IS 'Whether upload can be resumed from checkpoint';
COMMENT ON COLUMN curriculum_uploads.resume_from_stage IS 'Stage to resume from (1-4)';
COMMENT ON COLUMN curriculum_uploads.progress_percent IS 'Overall progress 0-100';
COMMENT ON COLUMN curriculum_uploads.current_stage_name IS 'Human-readable stage name for UI';
COMMENT ON COLUMN curriculum_uploads.current_item IS 'Current item being processed (e.g., Module 3 of 5)';
COMMENT ON COLUMN curriculum_uploads.stage_progress IS 'Per-stage detailed progress data';
COMMENT ON COLUMN curriculum_uploads.human_structure_edits IS 'Structure corrections made during Stage 2 review';
