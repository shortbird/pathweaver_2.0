-- Migration 021: Create Notifications Table
-- Purpose: System-wide notification center for user activity
-- Created: 2025-12-27
-- Part of: LMS Transformation - Notification System

BEGIN;

-- Create notifications table
CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    notification_type VARCHAR(100) NOT NULL,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    link VARCHAR(500),
    is_read BOOLEAN DEFAULT false,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT valid_notification_type CHECK (
        notification_type IN (
            'quest_invitation',
            'quest_started',
            'task_approved',
            'task_revision_requested',
            'announcement',
            'observer_comment',
            'badge_earned',
            'friendship_request',
            'message_received',
            'advisor_note',
            'system_alert'
        )
    )
);

-- Create indexes for efficient querying
CREATE INDEX idx_notifications_user ON notifications(user_id);
CREATE INDEX idx_notifications_unread ON notifications(user_id, is_read) WHERE is_read = false;
CREATE INDEX idx_notifications_created ON notifications(created_at DESC);
CREATE INDEX idx_notifications_user_created ON notifications(user_id, created_at DESC);

-- Composite index for organization-filtered queries
CREATE INDEX idx_notifications_org ON notifications(organization_id);

-- Enable RLS
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only view their own notifications
CREATE POLICY "users_view_own_notifications" ON notifications
    FOR SELECT
    USING (user_id = auth.uid());

-- RLS Policy: System can insert notifications (enforced at application layer)
CREATE POLICY "system_can_insert_notifications" ON notifications
    FOR INSERT
    WITH CHECK (true);

-- RLS Policy: Users can update their own notifications (mark as read)
CREATE POLICY "users_update_own_notifications" ON notifications
    FOR UPDATE
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

-- Add comments for documentation
COMMENT ON TABLE notifications IS 'User notifications for quest invitations, task approvals, announcements, and other activity';
COMMENT ON COLUMN notifications.notification_type IS 'Type of notification (see CHECK constraint for valid values)';
COMMENT ON COLUMN notifications.metadata IS 'Additional data specific to notification type (e.g., quest_id, task_id, etc.)';
COMMENT ON COLUMN notifications.link IS 'Optional URL to navigate when notification is clicked';

COMMIT;
