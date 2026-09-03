-- Migration: Create Evidence Reports tables
-- Date: 2026-02-09
-- Purpose: Enable students to create shareable evidence reports with PDF download

-- Create evidence_report_configs table
CREATE TABLE IF NOT EXISTS evidence_report_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    access_token VARCHAR(64) UNIQUE NOT NULL,
    title VARCHAR(255) NOT NULL DEFAULT 'Evidence Report',
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    is_active BOOLEAN DEFAULT TRUE,

    -- What to include in the report
    included_quest_ids UUID[] DEFAULT '{}',
    included_course_ids UUID[] DEFAULT '{}',
    include_learning_events BOOLEAN DEFAULT FALSE,
    include_xp_summary BOOLEAN DEFAULT TRUE,
    include_skills_breakdown BOOLEAN DEFAULT TRUE,

    -- FERPA compliance (minors need parent approval)
    requires_parent_approval BOOLEAN DEFAULT FALSE,
    parent_approval_status VARCHAR(20) DEFAULT 'not_required',
    parent_approved_at TIMESTAMPTZ,

    -- Analytics
    view_count INTEGER DEFAULT 0,
    last_viewed_at TIMESTAMPTZ
);

-- Add check constraint for parent_approval_status
ALTER TABLE evidence_report_configs ADD CONSTRAINT evidence_report_configs_parent_approval_status_check
    CHECK (parent_approval_status IN ('not_required', 'pending', 'approved', 'denied'));

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_evidence_report_configs_user ON evidence_report_configs(user_id);
CREATE INDEX IF NOT EXISTS idx_evidence_report_configs_token ON evidence_report_configs(access_token);
CREATE INDEX IF NOT EXISTS idx_evidence_report_configs_active ON evidence_report_configs(is_active) WHERE is_active = TRUE;

-- Create evidence_report_parent_approvals table for tracking parent approvals on minor reports
CREATE TABLE IF NOT EXISTS evidence_report_parent_approvals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_config_id UUID NOT NULL REFERENCES evidence_report_configs(id) ON DELETE CASCADE,
    parent_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    requested_at TIMESTAMPTZ DEFAULT NOW(),
    responded_at TIMESTAMPTZ,
    denial_reason TEXT
);

-- Add check constraint for approval status
ALTER TABLE evidence_report_parent_approvals ADD CONSTRAINT evidence_report_parent_approvals_status_check
    CHECK (status IN ('pending', 'approved', 'denied'));

-- Create index for lookups by report config
CREATE INDEX IF NOT EXISTS idx_evidence_report_parent_approvals_config ON evidence_report_parent_approvals(report_config_id);
CREATE INDEX IF NOT EXISTS idx_evidence_report_parent_approvals_parent ON evidence_report_parent_approvals(parent_user_id);

-- RLS Policies for evidence_report_configs
ALTER TABLE evidence_report_configs ENABLE ROW LEVEL SECURITY;

-- Users can view their own reports
CREATE POLICY evidence_report_configs_select_own ON evidence_report_configs
    FOR SELECT USING (user_id = auth.uid());

-- Users can create their own reports
CREATE POLICY evidence_report_configs_insert_own ON evidence_report_configs
    FOR INSERT WITH CHECK (user_id = auth.uid());

-- Users can update their own reports
CREATE POLICY evidence_report_configs_update_own ON evidence_report_configs
    FOR UPDATE USING (user_id = auth.uid());

-- Users can delete their own reports
CREATE POLICY evidence_report_configs_delete_own ON evidence_report_configs
    FOR DELETE USING (user_id = auth.uid());

-- RLS Policies for evidence_report_parent_approvals
ALTER TABLE evidence_report_parent_approvals ENABLE ROW LEVEL SECURITY;

-- Parents can view approvals assigned to them
CREATE POLICY evidence_report_parent_approvals_select_parent ON evidence_report_parent_approvals
    FOR SELECT USING (parent_user_id = auth.uid());

-- Parents can update approvals assigned to them
CREATE POLICY evidence_report_parent_approvals_update_parent ON evidence_report_parent_approvals
    FOR UPDATE USING (parent_user_id = auth.uid());

-- Students can view approvals for their reports (via join)
CREATE POLICY evidence_report_parent_approvals_select_student ON evidence_report_parent_approvals
    FOR SELECT USING (
        report_config_id IN (
            SELECT id FROM evidence_report_configs WHERE user_id = auth.uid()
        )
    );

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_evidence_report_configs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER evidence_report_configs_updated_at_trigger
    BEFORE UPDATE ON evidence_report_configs
    FOR EACH ROW
    EXECUTE FUNCTION update_evidence_report_configs_updated_at();

-- Add comment for documentation
COMMENT ON TABLE evidence_report_configs IS 'Stores configurations for shareable evidence reports that students can create';
COMMENT ON TABLE evidence_report_parent_approvals IS 'Tracks parent approval workflow for minor students creating public evidence reports (FERPA compliance)';
COMMENT ON COLUMN evidence_report_configs.access_token IS 'URL-safe token for public access (generated via secrets.token_urlsafe)';
COMMENT ON COLUMN evidence_report_configs.parent_approval_status IS 'FERPA compliance: not_required for adults, pending/approved/denied for minors';
