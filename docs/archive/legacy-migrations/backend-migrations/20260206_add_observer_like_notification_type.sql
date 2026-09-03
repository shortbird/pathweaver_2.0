-- Migration: Add observer_like notification type
-- Date: 2026-02-06
-- Purpose: Enable notifications when observers like student work

-- Drop existing constraint
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;

-- Recreate constraint with the new notification type
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check CHECK (
    type IN (
        'quest_invitation',
        'quest_started',
        'task_approved',
        'task_revision_requested',
        'announcement',
        'observer_comment',
        'observer_like',
        'badge_earned',
        'friendship_request',
        'message_received',
        'advisor_note',
        'system_alert',
        'parent_approval_required'
    )
);
