-- Friends, phase 3: safety depth for what kids write to each other.
--
-- Phase 1 decided who may be friends; phase 2 gave friends something to do
-- (comments, reactions). This is what stands behind those words once they are
-- flowing, and behind friend-to-friend chat, which this phase opens.
--
-- 1. A report may name a peer comment or a direct message, so the moderation
--    queue can take either down (routes/admin/moderation_queue.py writes the
--    hidden_* columns that were read and never written until now).
--
-- 2. Every peer comment and every student-to-student message is screened
--    (services/peer_text_screen_service.py). The screen fails OPEN: when the
--    model is unavailable the text posts with screen_status='pending' and a
--    cron sweep screens it later. Refusing to post during a Gemini incident
--    would silence every kid on the platform at once; posting unscreened and
--    catching up is the smaller harm. A text screened on the way in is
--    'clear'; one the sweep catches afterwards is hidden and marked 'flagged'.
--    NULL means the row predates screening or never needed it (adult chat).
--
-- 3. A text the screen refuses is not stored where it was going. It is kept in
--    peer_text_holds so the author's parent can see what their child tried to
--    say, and so a false positive has somewhere to be found.
--
-- 4. Notification type peer_text_held, for the author's parents.

ALTER TABLE public.content_reports DROP CONSTRAINT IF EXISTS content_reports_target_type_check;
ALTER TABLE public.content_reports ADD CONSTRAINT content_reports_target_type_check
  CHECK (target_type IN ('learning_event', 'task_completion', 'comment', 'user',
                         'peer_comment', 'message'));

ALTER TABLE public.peer_comments
  ADD COLUMN IF NOT EXISTS screen_status text,
  ADD COLUMN IF NOT EXISTS screened_at timestamptz;
ALTER TABLE public.peer_comments DROP CONSTRAINT IF EXISTS peer_comments_screen_status_check;
ALTER TABLE public.peer_comments ADD CONSTRAINT peer_comments_screen_status_check
  CHECK (screen_status IS NULL OR screen_status IN ('pending', 'clear', 'flagged'));
-- The sweep reads only what is pending; the index is as small as the backlog.
CREATE INDEX IF NOT EXISTS idx_peer_comments_screen_pending
  ON public.peer_comments (created_at)
  WHERE screen_status = 'pending';

ALTER TABLE public.direct_messages
  ADD COLUMN IF NOT EXISTS screen_status text,
  ADD COLUMN IF NOT EXISTS screened_at timestamptz;
ALTER TABLE public.direct_messages DROP CONSTRAINT IF EXISTS direct_messages_screen_status_check;
ALTER TABLE public.direct_messages ADD CONSTRAINT direct_messages_screen_status_check
  CHECK (screen_status IS NULL OR screen_status IN ('pending', 'clear', 'flagged'));
CREATE INDEX IF NOT EXISTS idx_direct_messages_screen_pending
  ON public.direct_messages (created_at)
  WHERE screen_status = 'pending';

CREATE TABLE IF NOT EXISTS public.peer_text_holds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  recipient_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  surface text NOT NULL CHECK (surface IN ('peer_comment', 'message')),
  -- 'refused': stopped at post time, never shown to anyone.
  -- 'hidden_later': posted while the model was down, hidden by the sweep;
  --   source_id names the row that was hidden.
  stage text NOT NULL CHECK (stage IN ('refused', 'hidden_later')),
  source_id uuid,
  text text NOT NULL,
  reasons text[] NOT NULL DEFAULT '{}',
  model text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.peer_text_holds ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_peer_text_holds_author
  ON public.peer_text_holds (author_id, created_at DESC);

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
  'peer_text_held'
])));
