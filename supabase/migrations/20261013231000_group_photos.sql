-- Group photos (ticket 85949de5, Apogee Cache Valley, 2026-10-13): a coach
-- takes one picture, taps every student in it, and the photo lands in each
-- tagged student's journal while their parents get a note.
--
-- 1. learning_events.source_type: allow 'advisor_captured'.
--
--    Three write paths have inserted it since they shipped -- the advisor
--    learning-moment capture (routes/advisor/learning_moments.py), the
--    Treehouse facilitator capture (routes/treehouse.py, now
--    services/group_photo_service.py) and a staff helper's evidence upload
--    (routes/helper_evidence.py) -- and the CHECK has never allowed it. Every
--    staff capture failed at the insert: prod held 0 such rows on 2026-10-13
--    against 313 parent_captured, 678 realtime and 2708 task_evidence. The
--    other values the code writes ('realtime', 'retroactive',
--    'parent_captured', 'task_evidence') were already allowed; mobile's
--    CaptureSheet posts 'parent', but /api/learning-events/quick rewrites a
--    delegated capture to 'parent_captured' before the insert, so it never
--    reaches the column.
--
-- 2. notifications.type: allow 'child_photo_added', the parent's bell row for
--    a photo of their child. Its own type so a parent can mute it without
--    muting everything else from the school. Widened the same way every type
--    before it was (20260918180000_school_notice_notification_type.sql); the
--    list below is prod's CHECK on 2026-10-13 plus the one new value.

ALTER TABLE public.learning_events
  DROP CONSTRAINT IF EXISTS learning_events_source_type_check;

ALTER TABLE public.learning_events
  ADD CONSTRAINT learning_events_source_type_check
  CHECK (source_type = ANY (ARRAY[
    'realtime'::text,
    'retroactive'::text,
    'parent_captured'::text,
    'task_evidence'::text,
    'advisor_captured'::text
  ]));

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
  'school_notice',
  'child_photo_added'
])));
