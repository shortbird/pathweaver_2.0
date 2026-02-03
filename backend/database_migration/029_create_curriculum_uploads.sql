-- Migration 029: Create curriculum_uploads table
-- AI-powered curriculum upload and transformation tracking
-- Created: January 2026

-- Table for tracking curriculum upload sessions and AI pipeline results
CREATE TABLE IF NOT EXISTS curriculum_uploads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Upload metadata
    source_type TEXT NOT NULL CHECK (source_type IN ('imscc', 'pdf', 'docx', 'text')),
    original_filename TEXT,
    file_size_bytes INTEGER,

    -- Processing status
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
        'pending',           -- Upload received, not yet processed
        'processing',        -- AI pipeline running
        'ready_for_review',  -- AI complete, awaiting human review
        'approved',          -- Human approved, quest created
        'rejected',          -- Human rejected
        'error'              -- Processing failed
    )),
    error_message TEXT,

    -- AI pipeline outputs (JSONB for flexibility)
    raw_content JSONB,           -- Stage 1: Parsed document content
    structured_content JSONB,    -- Stage 2: Detected curriculum structure
    aligned_content JSONB,       -- Stage 3: Philosophy-aligned content
    generated_content JSONB,     -- Stage 4: Final preview (course, lessons, tasks)

    -- Human edits during review
    human_edits JSONB,           -- Tracks what was changed during review

    -- Result tracking
    created_quest_id UUID REFERENCES quests(id) ON DELETE SET NULL,

    -- Audit fields
    uploaded_by UUID NOT NULL REFERENCES users(id),
    organization_id UUID REFERENCES organizations(id),
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reviewed_at TIMESTAMPTZ,
    reviewed_by UUID REFERENCES users(id),

    -- Processing metrics
    processing_time_ms INTEGER,
    ai_tokens_used INTEGER
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_curriculum_uploads_status
    ON curriculum_uploads(status);

CREATE INDEX IF NOT EXISTS idx_curriculum_uploads_uploaded_by
    ON curriculum_uploads(uploaded_by);

CREATE INDEX IF NOT EXISTS idx_curriculum_uploads_organization
    ON curriculum_uploads(organization_id);

CREATE INDEX IF NOT EXISTS idx_curriculum_uploads_uploaded_at
    ON curriculum_uploads(uploaded_at DESC);

-- RLS policies
ALTER TABLE curriculum_uploads ENABLE ROW LEVEL SECURITY;

-- Superadmins can see all uploads
CREATE POLICY curriculum_uploads_superadmin_all ON curriculum_uploads
    FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role = 'superadmin'
        )
    );

-- Org admins can see their organization's uploads
CREATE POLICY curriculum_uploads_org_admin_select ON curriculum_uploads
    FOR SELECT
    TO authenticated
    USING (
        organization_id IN (
            SELECT organization_id FROM users
            WHERE users.id = auth.uid()
            AND users.role = 'org_admin'
        )
    );

-- Advisors can see their own uploads
CREATE POLICY curriculum_uploads_advisor_own ON curriculum_uploads
    FOR ALL
    TO authenticated
    USING (
        uploaded_by = auth.uid()
        AND EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role IN ('advisor', 'org_admin', 'superadmin')
        )
    );

-- Comment on table
COMMENT ON TABLE curriculum_uploads IS 'Tracks AI-powered curriculum upload and transformation sessions';
COMMENT ON COLUMN curriculum_uploads.source_type IS 'Type of uploaded content: imscc (Canvas), pdf, docx, or text';
COMMENT ON COLUMN curriculum_uploads.status IS 'Current state in the upload/review workflow';
COMMENT ON COLUMN curriculum_uploads.generated_content IS 'Final AI output: {course, lessons, tasks} ready for preview';
COMMENT ON COLUMN curriculum_uploads.human_edits IS 'JSON tracking edits made during human review';
