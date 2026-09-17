-- A notification type for what a school's office does that concerns you.
--
-- Every SIS notice -- a seat offered off the waitlist, an enrollment
-- confirmed, a payment reminder, an attendance gap, a document to sign, a
-- class material posted -- was sent as type 'announcement' so the bell would
-- render it without a client change (services/sis_notifications.py). So a
-- family could not mute school announcements without muting the notice that
-- their seat came up, and the retraction sweep for a real announcement had to
-- filter on metadata to avoid them (docs/icreate/FRANKENSTEIN_AUDIT_2026-09-17.md,
-- D4; M1 in docs/sis/CONSOLIDATION_PLAN.md).
--
-- 'school_notice' is that type. 'announcement' now means an announcement.
-- Widens the CHECK the same way every type before it did.

ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check CHECK ((type = ANY (ARRAY[
  'quest_invitation','quest_started','task_approved','task_revision_requested','announcement',
  'observer_comment','observer_like','badge_earned','friendship_request','message_received',
  'advisor_note','system_alert','parent_approval_required','bounty_submission',
  'diploma_credit_approved','diploma_credit_grow_this','class_submitted_for_review',
  'bounty_posted','bounty_claimed','diploma_credit_requested','observer_accepted','observer_added',
  'org_approved_credit','video_processing','treehouse_help','treehouse_proud',
  'treehouse_task_completed','treehouse_quest_completed','treehouse_showcase_joined',
  'student_absent','attendance_reminder',
  'peer_connection_request','peer_connection_needs_approval','peer_connection_approved',
  'peer_connection_declined','peer_comment',
  'peer_friend_added',
  'peer_reaction',
  'peer_text_held',
  'class_quest_assigned',
  'child_task_reviewed',
  'class_work_reminder',
  'school_notice'
])));
