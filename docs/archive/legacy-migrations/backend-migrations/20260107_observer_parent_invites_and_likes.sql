-- Migration: Observer Parent Invites and Likes System
-- Purpose: Allow parents to invite observers, add likes functionality for observer feed
-- Date: January 7, 2026

-- ============================================
-- Part 1: Extend observer_invitations for parent-initiated invites
-- ============================================

-- Add column for tracking who invited (parent or student)
ALTER TABLE observer_invitations
ADD COLUMN IF NOT EXISTS invited_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL;

-- Add column for the role of the person who invited
ALTER TABLE observer_invitations
ADD COLUMN IF NOT EXISTS invited_by_role VARCHAR(20) DEFAULT 'student' CHECK (invited_by_role IN ('student', 'parent'));

-- Add index for querying invitations by inviter
CREATE INDEX IF NOT EXISTS idx_observer_invitations_invited_by
ON observer_invitations(invited_by_user_id);

-- Update existing invitations to set invited_by_user_id to student_id (they were all student-initiated)
UPDATE observer_invitations
SET invited_by_user_id = student_id, invited_by_role = 'student'
WHERE invited_by_user_id IS NULL;

-- ============================================
-- Part 2: Create observer_likes table
-- ============================================

CREATE TABLE IF NOT EXISTS observer_likes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    observer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    completion_id UUID NOT NULL REFERENCES quest_task_completions(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- Each observer can only like a completion once
    CONSTRAINT unique_observer_completion_like UNIQUE (observer_id, completion_id)
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_observer_likes_observer_id ON observer_likes(observer_id);
CREATE INDEX IF NOT EXISTS idx_observer_likes_completion_id ON observer_likes(completion_id);
CREATE INDEX IF NOT EXISTS idx_observer_likes_created_at ON observer_likes(created_at DESC);

-- Enable RLS
ALTER TABLE observer_likes ENABLE ROW LEVEL SECURITY;

-- Policy: Observers can view likes on completions they have access to
CREATE POLICY observer_view_likes ON observer_likes
    FOR SELECT
    USING (
        -- Observer can see their own likes
        observer_id = auth.uid()
        OR
        -- Or likes on students they have access to
        EXISTS (
            SELECT 1 FROM quest_task_completions qtc
            JOIN observer_student_links osl ON osl.student_id = qtc.user_id
            WHERE qtc.id = observer_likes.completion_id
            AND osl.observer_id = auth.uid()
        )
    );

-- Policy: Observers can insert their own likes
CREATE POLICY observer_insert_likes ON observer_likes
    FOR INSERT
    WITH CHECK (
        observer_id = auth.uid()
        AND EXISTS (
            SELECT 1 FROM quest_task_completions qtc
            JOIN observer_student_links osl ON osl.student_id = qtc.user_id
            WHERE qtc.id = observer_likes.completion_id
            AND osl.observer_id = auth.uid()
        )
    );

-- Policy: Observers can delete their own likes
CREATE POLICY observer_delete_likes ON observer_likes
    FOR DELETE
    USING (observer_id = auth.uid());

-- Policy: Admin/superadmin can manage all likes
CREATE POLICY admin_manage_likes ON observer_likes
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role IN ('admin', 'superadmin')
        )
    );

COMMENT ON TABLE observer_likes IS 'Stores likes from observers on student task completions';
COMMENT ON COLUMN observer_invitations.invited_by_user_id IS 'User ID of who created the invitation (parent or student)';
COMMENT ON COLUMN observer_invitations.invited_by_role IS 'Role of the inviter: student or parent';
