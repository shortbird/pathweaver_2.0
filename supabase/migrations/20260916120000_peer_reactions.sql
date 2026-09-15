-- Peer reactions: a friend's one-tap encouragement on a piece of work.
--
-- 2026-09-16, Friends phase 2. Comments existed (peer_comments) but had no
-- client; a reaction is the lighter act that gets a kid to say something at
-- all. The palette is fixed and every key is encouragement -- core_philosophy
-- forbids competition framing, so there is no "like" to count, no total to
-- rank by, and no negative option. One reaction per author per item: tapping
-- a different key replaces it, tapping the same key clears it.
--
-- Same one-target rule as peer_comments, and its own table for the same
-- reason: no observer or parent query can start returning peer rows by
-- accident.
CREATE TABLE IF NOT EXISTS public.peer_reactions (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id          uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  student_id         uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  learning_event_id  uuid REFERENCES public.learning_events(id) ON DELETE CASCADE,
  task_completion_id uuid REFERENCES public.quest_task_completions(id) ON DELETE CASCADE,
  quest_id           uuid REFERENCES public.quests(id) ON DELETE CASCADE,
  reaction           text NOT NULL,
  -- One column to be unique on, whichever of the three targets is set.
  target_key         text GENERATED ALWAYS AS (
                       coalesce(learning_event_id::text, task_completion_id::text, quest_id::text)
                     ) STORED,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT peer_reactions_not_self CHECK (author_id <> student_id),
  CONSTRAINT peer_reactions_one_target CHECK (
    (learning_event_id IS NOT NULL)::int
    + (task_completion_id IS NOT NULL)::int
    + (quest_id IS NOT NULL)::int = 1
  ),
  CONSTRAINT peer_reactions_reaction_check
    CHECK (reaction IN ('proud', 'inspired', 'curious', 'keep_going', 'thanks')),
  CONSTRAINT peer_reactions_one_per_author_per_item UNIQUE (author_id, target_key)
);

CREATE INDEX IF NOT EXISTS idx_peer_reactions_completion
  ON public.peer_reactions (task_completion_id) WHERE task_completion_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_peer_reactions_event
  ON public.peer_reactions (learning_event_id) WHERE learning_event_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_peer_reactions_student
  ON public.peer_reactions (student_id, created_at DESC);

COMMENT ON TABLE public.peer_reactions IS
  'A friend''s encouragement on one item of a student''s work. Fixed palette, '
  'one per author per item, never totalled into a score.';

ALTER TABLE public.peer_reactions ENABLE ROW LEVEL SECURITY;

-- The work owner is told.
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
  'peer_reaction'
])));
