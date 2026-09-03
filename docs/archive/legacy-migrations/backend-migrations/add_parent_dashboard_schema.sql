-- Migration: Add Parent Dashboard Schema
-- Description: Creates tables for parent-student linking, invitations, and parent-uploaded evidence
-- Date: 2025-01-17

-- ============================================
-- 1. Update users table to add role column
-- ============================================

-- Add role column if it doesn't exist (check first to avoid errors on re-run)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'role'
    ) THEN
        ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'student'
        CHECK (role IN ('student', 'parent', 'educator', 'admin'));

        -- Create index for role-based queries
        CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
    END IF;
END $$;

-- ============================================
-- 2. Create parent_student_links table
-- ============================================

CREATE TABLE IF NOT EXISTS parent_student_links (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    parent_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    student_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pending_invitation'
        CHECK (status IN ('pending_invitation', 'pending_approval', 'active')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    approved_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Ensure unique parent-student pairs
    UNIQUE(parent_user_id, student_user_id),

    -- Prevent self-linking
    CHECK (parent_user_id != student_user_id)
);

-- Indexes for parent_student_links
CREATE INDEX IF NOT EXISTS idx_parent_links_parent ON parent_student_links(parent_user_id);
CREATE INDEX IF NOT EXISTS idx_parent_links_student ON parent_student_links(student_user_id);
CREATE INDEX IF NOT EXISTS idx_parent_links_status ON parent_student_links(status);

-- RLS policies for parent_student_links
ALTER TABLE parent_student_links ENABLE ROW LEVEL SECURITY;

-- Parents can see their own links
CREATE POLICY parent_links_select_own ON parent_student_links
    FOR SELECT
    USING (auth.uid() = parent_user_id);

-- Students can see their own links
CREATE POLICY parent_links_select_student ON parent_student_links
    FOR SELECT
    USING (auth.uid() = student_user_id);

-- Students can update their own links (for approval)
CREATE POLICY parent_links_update_student ON parent_student_links
    FOR UPDATE
    USING (auth.uid() = student_user_id);

-- ============================================
-- 3. Create parent_invitations table
-- ============================================

CREATE TABLE IF NOT EXISTS parent_invitations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email TEXT NOT NULL,
    invited_by_student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),

    -- Prevent duplicate pending invitations for same email-student pair
    UNIQUE(email, invited_by_student_id)
);

-- Indexes for parent_invitations
CREATE INDEX IF NOT EXISTS idx_parent_invites_token ON parent_invitations(token);
CREATE INDEX IF NOT EXISTS idx_parent_invites_email ON parent_invitations(email);
CREATE INDEX IF NOT EXISTS idx_parent_invites_student ON parent_invitations(invited_by_student_id);
CREATE INDEX IF NOT EXISTS idx_parent_invites_expires ON parent_invitations(expires_at);

-- RLS policies for parent_invitations
ALTER TABLE parent_invitations ENABLE ROW LEVEL SECURITY;

-- Students can see their own invitations
CREATE POLICY parent_invites_select_own ON parent_invitations
    FOR SELECT
    USING (auth.uid() = invited_by_student_id);

-- Students can insert their own invitations
CREATE POLICY parent_invites_insert_own ON parent_invitations
    FOR INSERT
    WITH CHECK (auth.uid() = invited_by_student_id);

-- Students can delete their own invitations
CREATE POLICY parent_invites_delete_own ON parent_invitations
    FOR DELETE
    USING (auth.uid() = invited_by_student_id);

-- ============================================
-- 4. Create parent_evidence_uploads table
-- ============================================

CREATE TABLE IF NOT EXISTS parent_evidence_uploads (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    parent_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    student_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    task_id UUID NOT NULL,
    file_url TEXT NOT NULL,
    description TEXT,
    uploaded_at TIMESTAMPTZ DEFAULT NOW(),
    student_approved BOOLEAN DEFAULT FALSE,
    approved_at TIMESTAMPTZ,

    -- Ensure parent has permission to upload for this student
    CONSTRAINT valid_parent_student_link
        FOREIGN KEY (parent_user_id, student_user_id)
        REFERENCES parent_student_links(parent_user_id, student_user_id)
        ON DELETE CASCADE
);

-- Indexes for parent_evidence_uploads
CREATE INDEX IF NOT EXISTS idx_parent_evidence_parent ON parent_evidence_uploads(parent_user_id);
CREATE INDEX IF NOT EXISTS idx_parent_evidence_student ON parent_evidence_uploads(student_user_id);
CREATE INDEX IF NOT EXISTS idx_parent_evidence_task ON parent_evidence_uploads(task_id);
CREATE INDEX IF NOT EXISTS idx_parent_evidence_approval ON parent_evidence_uploads(student_approved);

-- RLS policies for parent_evidence_uploads
ALTER TABLE parent_evidence_uploads ENABLE ROW LEVEL SECURITY;

-- Parents can see their own uploads
CREATE POLICY parent_evidence_select_parent ON parent_evidence_uploads
    FOR SELECT
    USING (auth.uid() = parent_user_id);

-- Students can see uploads for them
CREATE POLICY parent_evidence_select_student ON parent_evidence_uploads
    FOR SELECT
    USING (auth.uid() = student_user_id);

-- Parents can insert uploads for their linked students
CREATE POLICY parent_evidence_insert ON parent_evidence_uploads
    FOR INSERT
    WITH CHECK (
        auth.uid() = parent_user_id
        AND EXISTS (
            SELECT 1 FROM parent_student_links
            WHERE parent_user_id = auth.uid()
            AND student_user_id = parent_evidence_uploads.student_user_id
            AND status = 'active'
        )
    );

-- Students can update approval status
CREATE POLICY parent_evidence_update_student ON parent_evidence_uploads
    FOR UPDATE
    USING (auth.uid() = student_user_id)
    WITH CHECK (auth.uid() = student_user_id);

-- ============================================
-- 5. Create helper functions
-- ============================================

-- Function to check if parent has access to student
CREATE OR REPLACE FUNCTION parent_has_access_to_student(
    p_parent_id UUID,
    p_student_id UUID
) RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM parent_student_links
        WHERE parent_user_id = p_parent_id
        AND student_user_id = p_student_id
        AND status = 'active'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get student's learning rhythm status
CREATE OR REPLACE FUNCTION get_learning_rhythm_status(p_student_id UUID)
RETURNS TABLE(
    status TEXT,
    has_overdue_tasks BOOLEAN,
    has_recent_progress BOOLEAN,
    last_activity_date TIMESTAMPTZ,
    overdue_task_count INTEGER
) AS $$
DECLARE
    v_has_overdue BOOLEAN := FALSE;
    v_has_progress BOOLEAN := FALSE;
    v_last_activity TIMESTAMPTZ;
    v_overdue_count INTEGER := 0;
BEGIN
    -- Check for overdue tasks (wandering)
    SELECT
        COUNT(*) > 0,
        COUNT(*)
    INTO v_has_overdue, v_overdue_count
    FROM user_quest_deadlines uqd
    JOIN user_quest_tasks uqt ON uqt.id = uqd.task_id
    LEFT JOIN quest_task_completions qtc ON qtc.task_id = uqt.id AND qtc.user_id = p_student_id
    WHERE uqd.user_id = p_student_id
    AND uqd.scheduled_date < CURRENT_DATE
    AND qtc.id IS NULL; -- Not completed

    -- Check for recent progress (last 7 days)
    SELECT MAX(activity_date) INTO v_last_activity
    FROM (
        -- Task completions
        SELECT completed_at AS activity_date
        FROM quest_task_completions
        WHERE user_id = p_student_id
        AND completed_at > NOW() - INTERVAL '7 days'

        UNION ALL

        -- Quest starts
        SELECT started_at AS activity_date
        FROM user_quests
        WHERE user_id = p_student_id
        AND started_at > NOW() - INTERVAL '7 days'
    ) activities;

    v_has_progress := (v_last_activity IS NOT NULL);

    -- Determine status
    IF NOT v_has_overdue AND v_has_progress THEN
        status := 'flow';
    ELSE
        status := 'needs_support';
    END IF;

    RETURN QUERY SELECT
        status,
        v_has_overdue,
        v_has_progress,
        v_last_activity,
        v_overdue_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 6. Create updated_at trigger function
-- ============================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to parent_student_links
DROP TRIGGER IF EXISTS update_parent_links_updated_at ON parent_student_links;
CREATE TRIGGER update_parent_links_updated_at
    BEFORE UPDATE ON parent_student_links
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 7. Grant permissions
-- ============================================

-- Grant usage to authenticated users
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT ALL ON parent_student_links TO authenticated;
GRANT ALL ON parent_invitations TO authenticated;
GRANT ALL ON parent_evidence_uploads TO authenticated;

-- Grant execute on functions
GRANT EXECUTE ON FUNCTION parent_has_access_to_student TO authenticated;
GRANT EXECUTE ON FUNCTION get_learning_rhythm_status TO authenticated;

-- ============================================
-- Migration complete
-- ============================================

COMMENT ON TABLE parent_student_links IS 'Links between parent and student accounts (no revocation - permanent once approved)';
COMMENT ON TABLE parent_invitations IS 'Pending parent invitations sent by students';
COMMENT ON TABLE parent_evidence_uploads IS 'Evidence uploaded by parents on behalf of students';
COMMENT ON FUNCTION get_learning_rhythm_status IS 'Calculates student learning rhythm (flow vs needs_support)';
COMMENT ON FUNCTION parent_has_access_to_student IS 'Checks if parent has active access to student data';
