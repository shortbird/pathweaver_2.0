-- Course Plan Mode sessions for iterative AI-assisted course design
-- Stores conversation state, outline versions, and generation progress

CREATE TABLE IF NOT EXISTS course_plan_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
    title TEXT,
    status TEXT NOT NULL DEFAULT 'drafting',
    current_outline JSONB NOT NULL DEFAULT '{}'::jsonb,
    outline_history JSONB DEFAULT '[]'::jsonb,
    conversation JSONB DEFAULT '[]'::jsonb,
    generation_job_id UUID,
    created_course_id UUID REFERENCES courses(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Add constraint to ensure valid status values
ALTER TABLE course_plan_sessions
    ADD CONSTRAINT course_plan_sessions_status_check
    CHECK (status IN ('drafting', 'approved', 'generating', 'completed', 'abandoned'));

-- Indexes for faster queries
CREATE INDEX idx_plan_sessions_user ON course_plan_sessions(user_id);
CREATE INDEX idx_plan_sessions_org ON course_plan_sessions(organization_id);
CREATE INDEX idx_plan_sessions_status ON course_plan_sessions(status);
CREATE INDEX idx_plan_sessions_created_at ON course_plan_sessions(created_at DESC);

-- Enable RLS
ALTER TABLE course_plan_sessions ENABLE ROW LEVEL SECURITY;

-- Superadmin can manage all plan sessions
CREATE POLICY "Superadmin can manage all plan sessions" ON course_plan_sessions
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role = 'superadmin'
        )
    );

-- Org admins can manage plan sessions for their organization
CREATE POLICY "Org admins can manage org plan sessions" ON course_plan_sessions
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.organization_id = course_plan_sessions.organization_id
            AND (users.role = 'org_managed' AND users.org_role = 'org_admin')
        )
    );

-- Advisors can manage their own plan sessions
CREATE POLICY "Advisors can manage own plan sessions" ON course_plan_sessions
    FOR ALL USING (
        course_plan_sessions.user_id = auth.uid()
        AND EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND (
                users.role = 'advisor'
                OR (users.role = 'org_managed' AND users.org_role = 'advisor')
            )
        )
    );

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_course_plan_sessions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_course_plan_sessions_timestamp
    BEFORE UPDATE ON course_plan_sessions
    FOR EACH ROW
    EXECUTE FUNCTION update_course_plan_sessions_updated_at();
