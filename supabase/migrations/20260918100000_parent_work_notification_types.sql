-- Three notification types a parent should have been getting and was not
-- (parent experience audit, 2026-09-15, ticket 55ef3acf):
--
--   class_quest_assigned   a class quest reached my child (on assignment and
--                          on the scheduled publish sweep)
--   child_task_reviewed    a teacher reviewed my child's submission
--   class_work_reminder    the teacher's "still to do" nudge, which was sent
--                          as type 'announcement' and so looked like one --
--                          and could not be turned off on its own
--
-- Widens the CHECK the same way every type before it did (see
-- 20260917100000_peer_text_safety.sql). Nothing else changes.

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
  'class_work_reminder'
])));
