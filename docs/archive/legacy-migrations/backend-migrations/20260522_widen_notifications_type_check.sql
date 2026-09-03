-- ============================================================
-- Migration: Widen notifications.type CHECK constraint
-- Date: 2026-05-22
--
-- The backend NotificationService.create_notification() emits 7 types that
-- the CHECK constraint doesn't allow. When those fire, the INSERT throws
-- and neither the in-app notification nor the mobile push goes out --
-- silent failure. Widen the constraint to cover everything the service
-- actually produces.
--
-- New types being added (verified via grep across backend/):
--   - bounty_posted
--   - bounty_claimed
--   - diploma_credit_requested
--   - observer_accepted
--   - observer_added
--   - org_approved_credit
--   - video_processing
--
-- Existing types are preserved verbatim from the current constraint def.
-- ============================================================

BEGIN;

ALTER TABLE notifications
  DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE notifications
  ADD CONSTRAINT notifications_type_check
  CHECK (type = ANY (ARRAY[
    -- existing (preserve)
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
    'parent_approval_required',
    'bounty_submission',
    'diploma_credit_approved',
    'diploma_credit_grow_this',
    'class_submitted_for_review',
    -- new (previously emitted but rejected by CHECK)
    'bounty_posted',
    'bounty_claimed',
    'diploma_credit_requested',
    'observer_accepted',
    'observer_added',
    'org_approved_credit',
    'video_processing'
  ]::text[]));

COMMIT;

-- Verification
SELECT pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'public.notifications'::regclass
  AND conname = 'notifications_type_check';
