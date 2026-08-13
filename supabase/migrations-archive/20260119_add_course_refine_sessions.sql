-- Course refinement sessions for AI-assisted course improvements
-- Stores conversation state and proposed/applied changes

CREATE TABLE IF NOT EXISTS course_refine_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'active',
    initial_request TEXT NOT NULL,
    conversation_history JSONB DEFAULT '[]'::jsonb,
    proposed_changes JSONB DEFAULT '[]'::jsonb,
    applied_changes JSONB DEFAULT '[]'::jsonb,
    prompt_update_applied TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Add constraint to ensure valid status values
ALTER TABLE course_refine_sessions
    ADD CONSTRAINT course_refine_sessions_status_check
    CHECK (status IN ('active', 'completed', 'cancelled'));

-- Indexes for faster queries
CREATE INDEX idx_refine_sessions_course ON course_refine_sessions(course_id);
CREATE INDEX idx_refine_sessions_user ON course_refine_sessions(user_id);
CREATE INDEX idx_refine_sessions_status ON course_refine_sessions(status);

-- Enable RLS
ALTER TABLE course_refine_sessions ENABLE ROW LEVEL SECURITY;

-- Only superadmin can access refine sessions
CREATE POLICY "Superadmin can manage refine sessions" ON course_refine_sessions
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role = 'superadmin'
        )
    );

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_course_refine_sessions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_course_refine_sessions_timestamp
    BEFORE UPDATE ON course_refine_sessions
    FOR EACH ROW
    EXECUTE FUNCTION update_course_refine_sessions_updated_at();
