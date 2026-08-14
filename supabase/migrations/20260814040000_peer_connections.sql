-- Peer connections: let two students see and comment on each other's work.
--
-- 2026-08-14. Students asked to add each other as "friends". The thing that
-- makes this safe is not the label but three properties, all encoded here:
--
--   1. No discovery surface. A connection starts from one student naming
--      another; there is no searchable directory of children. The request is
--      the only entry point, and it dies unless the other side accepts.
--   2. Both families consent. A connection discloses BOTH students' work, so
--      each side needs its own approver (a parent, or -- inside a single
--      organization only -- that org's admin standing in under the school
--      exception). One family cannot consent on another family's behalf.
--   3. Under-13 students do not get in at all. COPPA's line is 13, and free
--      peer-to-peer text from under-13s is outside the internal-operations
--      exception. The gate is an age screen, and the screen only works if it
--      records the honest answer -- see date_of_birth_locked_at below.
--
-- Note the deliberate asymmetry with observers: an observer is an adult the
-- family invited, and observer_comments carries that trust. Peer comments are
-- children talking to children. They get their own table so that no existing
-- observer/parent query can start returning peer text by accident, and no peer
-- query can start returning an adult's private note to a student.

-- ---------------------------------------------------------------------------
-- 1. The age screen has to be able to record "under 13"
-- ---------------------------------------------------------------------------
-- PUT /api/users/profile rejects an under-13 date of birth outright, which is
-- correct for a profile editor and exactly wrong for an age screen: a child who
-- answers honestly gets a validation error and a form still waiting for input,
-- so they retype the year until it passes. That teaches falsification, which is
-- the one thing a neutral age screen must not do.
--
-- So the screen records whatever is entered -- including under 13 -- and stamps
-- this column. Once stamped, the value is one-shot: self-service edits are
-- refused (see routes/users/profile.py) and only a parent or an admin can
-- correct it. Without the lock the whole gate is decorative, because a blocked
-- student would just walk to Account Settings and change their birthday.
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS date_of_birth_locked_at timestamptz;

COMMENT ON COLUMN public.users.date_of_birth_locked_at IS
  'Set when the student self-attested their date of birth through the peer '
  'connection age screen. Non-null means the value is one-shot: the student '
  'may no longer edit it themselves. Parents and admins still can.';

-- ---------------------------------------------------------------------------
-- 2. The connection itself
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.peer_connections (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id    uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  addressee_id    uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,

  -- pending_addressee -> the other student has not answered yet
  -- pending_approval  -> both students want it; waiting on the grown-ups
  -- active            -> every required approval is in
  -- declined          -> a student or an approver said no
  -- revoked           -> was active, then withdrawn (by a student or a parent)
  status          text NOT NULL DEFAULT 'pending_addressee',

  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  responded_at    timestamptz,
  activated_at    timestamptz,
  revoked_at      timestamptz,
  revoked_by      uuid REFERENCES public.users(id) ON DELETE SET NULL,
  revoke_reason   text,

  CONSTRAINT peer_connections_status_check
    CHECK (status IN ('pending_addressee', 'pending_approval', 'active',
                      'declined', 'revoked')),
  -- A connection is a relationship, not a direction. Self-connection is not a
  -- thing, and would otherwise satisfy every approval check trivially.
  CONSTRAINT peer_connections_not_self CHECK (requester_id <> addressee_id)
);

-- One connection per pair, regardless of who asked first. Without the
-- least/greatest canonical form, A->B and B->A are two different rows and the
-- second one is a way to re-ask a question that was already answered "no".
CREATE UNIQUE INDEX IF NOT EXISTS idx_peer_connections_pair
  ON public.peer_connections (LEAST(requester_id, addressee_id),
                              GREATEST(requester_id, addressee_id));

CREATE INDEX IF NOT EXISTS idx_peer_connections_requester
  ON public.peer_connections (requester_id, status);
CREATE INDEX IF NOT EXISTS idx_peer_connections_addressee
  ON public.peer_connections (addressee_id, status);

COMMENT ON TABLE public.peer_connections IS
  'A mutual, parent-approved link between two students, allowing each to view '
  'and comment on the other''s work. See utils/portfolio_access.is_peer_of.';

-- ---------------------------------------------------------------------------
-- 3. One approval row per side
-- ---------------------------------------------------------------------------
-- Two rows per connection, one per student, each naming that student's own
-- approver. Modelling this as two booleans on peer_connections would lose the
-- part that matters for a consent record: WHO approved, and when. A COPPA
-- consent you cannot attribute to a named adult is not a consent.
CREATE TABLE IF NOT EXISTS public.peer_connection_approvals (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id  uuid NOT NULL REFERENCES public.peer_connections(id) ON DELETE CASCADE,

  -- Which side of the connection this approval covers.
  student_id     uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,

  -- Resolved at request time via portfolio_access.find_approver. Recorded
  -- rather than re-derived, because who the accountable adult was on the day
  -- consent was given is the fact being kept -- parents get unlinked, org
  -- admins leave, and a re-derived answer would quietly rewrite history.
  approver_id    uuid REFERENCES public.users(id) ON DELETE SET NULL,
  approver_kind  text,

  status         text NOT NULL DEFAULT 'pending',
  responded_at   timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT peer_connection_approvals_status_check
    CHECK (status IN ('pending', 'approved', 'declined')),
  CONSTRAINT peer_connection_approvals_kind_check
    CHECK (approver_kind IS NULL OR approver_kind IN ('parent', 'org_admin')),
  CONSTRAINT peer_connection_approvals_one_per_side
    UNIQUE (connection_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_peer_connection_approvals_approver
  ON public.peer_connection_approvals (approver_id, status);

COMMENT ON COLUMN public.peer_connection_approvals.approver_kind IS
  'parent = a real parent/guardian link. org_admin = the school standing in '
  'under the COPPA school exception, which is only valid when BOTH students '
  'are in that same organization (enforced in services/peer_connection_service).';

-- ---------------------------------------------------------------------------
-- 3b. Share codes -- the reason there is no directory
-- ---------------------------------------------------------------------------
-- A student cannot look another student up. Instead each eligible student can
-- mint a short code and hand it over in person; entering someone's code is what
-- creates the request. This is the whole safety argument for discovery: a
-- searchable list of children is the part of a "friends" feature that attracts
-- strangers, and there isn't one here. Out-of-band exchange also means an adult
-- watching the room is a natural part of the flow.
--
-- Codes expire and are single-owner-rotatable so that one leaked code does not
-- become a permanent inbound channel.
CREATE TABLE IF NOT EXISTS public.peer_connect_codes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  code        text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL,
  revoked_at  timestamptz
);

-- Codes are typed in by children, so they are short; that makes uniqueness
-- among *live* codes load-bearing rather than incidental. Expired and revoked
-- codes drop out of the index so the small keyspace can be reused.
CREATE UNIQUE INDEX IF NOT EXISTS idx_peer_connect_codes_live
  ON public.peer_connect_codes (code) WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_peer_connect_codes_user
  ON public.peer_connect_codes (user_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- 4. Peer comments
-- ---------------------------------------------------------------------------
-- Separate from observer_comments on purpose; see the header note.
CREATE TABLE IF NOT EXISTS public.peer_comments (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id          uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  student_id         uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,

  -- Exactly one target, mirroring observer_comments' shape.
  learning_event_id  uuid,
  task_completion_id uuid,
  quest_id           uuid,

  comment_text       text NOT NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),

  -- Moderation. A hidden comment is kept, not deleted: the report queue in
  -- /api/admin/moderation needs the text it was filed against, and a parent
  -- asking "what was said to my child" needs an answer.
  hidden_at          timestamptz,
  hidden_by          uuid REFERENCES public.users(id) ON DELETE SET NULL,
  hidden_reason      text,

  CONSTRAINT peer_comments_not_self CHECK (author_id <> student_id),
  CONSTRAINT peer_comments_one_target CHECK (
    (learning_event_id IS NOT NULL)::int
    + (task_completion_id IS NOT NULL)::int
    + (quest_id IS NOT NULL)::int = 1
  )
);

CREATE INDEX IF NOT EXISTS idx_peer_comments_student
  ON public.peer_comments (student_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_peer_comments_learning_event
  ON public.peer_comments (learning_event_id) WHERE learning_event_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_peer_comments_completion
  ON public.peer_comments (task_completion_id) WHERE task_completion_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 5. Notification types
-- ---------------------------------------------------------------------------
-- notifications.type is a CHECK constraint, not an enum, so a new type has to
-- be added here or the insert dies as an unreadable 500 at write time.
-- 'friendship_request' already exists from the dropped friendships feature and
-- is deliberately NOT reused -- it would mix into any historical query.
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check CHECK (
  type = ANY (ARRAY[
    'quest_invitation', 'quest_started', 'task_approved',
    'task_revision_requested', 'announcement', 'observer_comment',
    'observer_like', 'badge_earned', 'friendship_request', 'message_received',
    'advisor_note', 'system_alert', 'parent_approval_required',
    'bounty_submission', 'diploma_credit_approved', 'diploma_credit_grow_this',
    'class_submitted_for_review', 'bounty_posted', 'bounty_claimed',
    'diploma_credit_requested', 'observer_accepted', 'observer_added',
    'org_approved_credit', 'video_processing', 'treehouse_help',
    'treehouse_proud', 'treehouse_task_completed', 'treehouse_quest_completed',
    'treehouse_showcase_joined', 'student_absent', 'attendance_reminder',
    -- Peer connections (2026-08-14)
    'peer_connection_request',
    'peer_connection_needs_approval',
    'peer_connection_approved',
    'peer_connection_declined',
    'peer_comment'
  ])
);

-- ---------------------------------------------------------------------------
-- 6. RLS
-- ---------------------------------------------------------------------------
-- Deny-all to anon/authenticated with no policies; the service role bypasses
-- RLS and every read goes through a route that gates on
-- portfolio_access.is_peer_of. Same posture as prior_learning_records.
ALTER TABLE public.peer_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.peer_connection_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.peer_connect_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.peer_comments ENABLE ROW LEVEL SECURITY;
