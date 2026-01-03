-- Migration: Add parent_approval_required notification type
-- Date: 2026-01-02
-- Purpose: Enable notifications for FERPA parent approval workflow

-- Drop existing constraint (may have different names depending on how table was created)
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS valid_notification_type;
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;

-- Recreate constraint with the new notification type
-- Note: Column is named 'type' not 'notification_type'
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check CHECK (
    type IN (
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
        'system_alert',
        'parent_approval_required'
    )
);
