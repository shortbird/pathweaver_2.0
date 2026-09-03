-- Migration: Create advisor_checkins table
-- Date: 2025-01-11
-- Description: Adds advisor check-in tracking for student meetings

-- Create the advisor_checkins table
CREATE TABLE IF NOT EXISTS advisor_checkins (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    advisor_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    checkin_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    active_quests_snapshot JSONB DEFAULT '[]'::jsonb,
    growth_moments TEXT,
    student_voice TEXT,
    obstacles TEXT,
    solutions TEXT,
    advisor_notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_checkins_advisor_student
    ON advisor_checkins(advisor_id, student_id, checkin_date DESC);

CREATE INDEX IF NOT EXISTS idx_checkins_student
    ON advisor_checkins(student_id, checkin_date DESC);

CREATE INDEX IF NOT EXISTS idx_checkins_date
    ON advisor_checkins(checkin_date DESC);

-- Add RLS policies
ALTER TABLE advisor_checkins ENABLE ROW LEVEL SECURITY;

-- Policy: Advisors can view their own check-ins
CREATE POLICY advisor_view_own_checkins ON advisor_checkins
    FOR SELECT
    USING (
        advisor_id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role IN ('admin', 'advisor')
        )
    );

-- Policy: Advisors can create check-ins
CREATE POLICY advisor_create_checkins ON advisor_checkins
    FOR INSERT
    WITH CHECK (
        advisor_id = auth.uid()
        AND EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role IN ('admin', 'advisor')
        )
    );

-- Policy: Advisors can update their own check-ins
CREATE POLICY advisor_update_own_checkins ON advisor_checkins
    FOR UPDATE
    USING (
        advisor_id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role = 'admin'
        )
    );

-- Policy: Only admins can delete check-ins
CREATE POLICY admin_delete_checkins ON advisor_checkins
    FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role = 'admin'
        )
    );

-- Add updated_at trigger
CREATE OR REPLACE FUNCTION update_advisor_checkins_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER advisor_checkins_updated_at
    BEFORE UPDATE ON advisor_checkins
    FOR EACH ROW
    EXECUTE FUNCTION update_advisor_checkins_updated_at();

-- Add comment
COMMENT ON TABLE advisor_checkins IS 'Tracks advisor check-ins with students for progress monitoring and support';
