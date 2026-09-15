-- Friends: a per-child policy replaces per-connection parent approval.
--
-- 2026-09-16. The peer-connection system shipped 2026-08-14 required four
-- parties to say yes before two students could see each other's work: both
-- students, then both students' parents (or org admins), each by email or
-- in-app. One month on there was ONE active connection on the whole platform.
-- Not because families said no -- because the least-engaged parent of any pair
-- never answered, and under-13s (a quarter of all students) were locked out
-- entirely.
--
-- What replaces it. COPPA requires verifiable parental consent for the
-- PRACTICE of disclosing a child's information to other users, not for each
-- recipient. So the parent consents once, per child, by turning Friends on and
-- setting the boundaries; kids then connect freely inside them, and the parent
-- is told of every new friend after the fact, sees the full list, and can
-- remove, block, or turn Friends off. "Ask me first" stays as a per-child dial
-- that reproduces the old approve-first behaviour for that side only.
--
-- The verification tier does not change: an authenticated parent acting in-app
-- was what a per-friend click was, and it is what the toggle is. What changes
-- is where the parent sits -- setting the boundary and watching, instead of
-- gatekeeping every social act.
--
-- Three properties from the 2026-08-14 migration survive untouched:
--   * no searchable directory of children (discovery is vetted pools only),
--   * one accountable adult per side, never one family consenting for another,
--   * _maybe_activate is still the single writer of 'active'.
-- The per-side approval row survives too: it is the audit record of WHO
-- consented for each student, now either by policy or explicitly.

-- ---------------------------------------------------------------------------
-- 1. The policy: one row per child, absent means "off"
-- ---------------------------------------------------------------------------
-- A table rather than columns on users: the attribution columns (who set it,
-- when, under which consent record) ARE the consent record and belong with the
-- other peer tables under the same deny-all RLS; row absence is a meaningful
-- state (-> org default -> off); and phase 3 adds 'message' to friends_can.
CREATE TABLE IF NOT EXISTS public.peer_policies (
  student_id       uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  enabled          boolean NOT NULL DEFAULT false,
  -- auto:      a request the student accepts activates at once; the parent is told
  -- ask_first: the parent answers before it activates (the 2026-08-14 behaviour)
  approval_mode    text NOT NULL DEFAULT 'auto',
  -- Who may send this child a request. 'parent' (a guardian asking on their own
  -- child's behalf) is always allowed when enabled and is not listed here.
  request_sources  text[] NOT NULL DEFAULT ARRAY['classmates', 'code', 'link']::text[],
  -- What a friend may do. 'message' is reserved for phase 3 and refused by the
  -- API until then.
  friends_can      text[] NOT NULL DEFAULT ARRAY['see', 'comment']::text[],
  set_by_user_id   uuid REFERENCES public.users(id) ON DELETE SET NULL,
  set_by_kind      text,
  set_at           timestamptz NOT NULL DEFAULT now(),
  -- The parental_consent_log row written when enabled last flipped to true.
  consent_log_id   uuid REFERENCES public.parental_consent_log(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT peer_policies_mode_check
    CHECK (approval_mode IN ('auto', 'ask_first')),
  CONSTRAINT peer_policies_set_by_kind_check
    CHECK (set_by_kind IS NULL OR set_by_kind IN ('parent', 'org_admin', 'superadmin', 'self')),
  CONSTRAINT peer_policies_sources_check
    CHECK (request_sources <@ ARRAY['classmates', 'code', 'link', 'school']::text[]),
  CONSTRAINT peer_policies_friends_can_check
    CHECK (friends_can <@ ARRAY['see', 'comment', 'message']::text[])
);

COMMENT ON TABLE public.peer_policies IS
  'Per-child Friends policy set by a parent (or the org admin standing in). '
  'Absent row = off. The consent is the flip to enabled=true, attributed via '
  'set_by_user_id and consent_log_id.';

-- ---------------------------------------------------------------------------
-- 2. Where a request came from, and who really made it
-- ---------------------------------------------------------------------------
ALTER TABLE public.peer_connections
  ADD COLUMN IF NOT EXISTS source text,
  ADD COLUMN IF NOT EXISTS created_by_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE public.peer_connections
  DROP CONSTRAINT IF EXISTS peer_connections_source_check;
ALTER TABLE public.peer_connections
  ADD CONSTRAINT peer_connections_source_check
    CHECK (source IS NULL OR source IN ('code', 'link', 'classmates', 'school', 'parent'));

COMMENT ON COLUMN public.peer_connections.created_by_user_id IS
  'The acting user when the request was made on a student''s behalf (a parent '
  'through student scope). NULL means the requester themselves.';

-- ---------------------------------------------------------------------------
-- 3. How each side consented: by policy, or explicitly
-- ---------------------------------------------------------------------------
ALTER TABLE public.peer_connection_approvals
  ADD COLUMN IF NOT EXISTS method text NOT NULL DEFAULT 'explicit',
  ADD COLUMN IF NOT EXISTS decided_by_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE public.peer_connection_approvals
  DROP CONSTRAINT IF EXISTS peer_connection_approvals_method_check;
ALTER TABLE public.peer_connection_approvals
  ADD CONSTRAINT peer_connection_approvals_method_check
    CHECK (method IN ('explicit', 'policy'));

COMMENT ON COLUMN public.peer_connection_approvals.method IS
  'policy: auto-approved under the child''s Friends policy, approver_id is who '
  'set that policy. explicit: an adult answered this request (ask_first).';
COMMENT ON COLUMN public.peer_connection_approvals.decided_by_user_id IS
  'Who actually answered an explicit approval. Any current parent of the '
  'student may answer, not only the one recorded as approver_id.';

-- ---------------------------------------------------------------------------
-- 4. The consent log has to be able to record an in-app toggle
-- ---------------------------------------------------------------------------
-- parental_consent_log was shaped for the emailed-token flow: a token, two email
-- addresses, and a method of email_link / esignature / admin_assisted. A parent
-- flipping a toggle in their own signed-in session has no token, and a
-- dependent has a placeholder email. Loosen exactly those, and name the scope
-- so an account-creation consent and a peer-friends consent are two events.
ALTER TABLE public.parental_consent_log
  ALTER COLUMN consent_token DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS consent_scope text NOT NULL DEFAULT 'account',
  ADD COLUMN IF NOT EXISTS granted_by_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE public.parental_consent_log
  DROP CONSTRAINT IF EXISTS parental_consent_log_consent_method_check;
ALTER TABLE public.parental_consent_log
  ADD CONSTRAINT parental_consent_log_consent_method_check
    CHECK (consent_method IN ('email_link', 'esignature', 'admin_assisted', 'in_app_toggle'));

COMMENT ON COLUMN public.parental_consent_log.consent_scope IS
  'account: the original account-creation consent. peer_friends: a parent '
  'enabled Friends for this child.';

-- ---------------------------------------------------------------------------
-- 5. One new notification: the parent is told after the fact
-- ---------------------------------------------------------------------------
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
  'peer_friend_added'
])));

-- ---------------------------------------------------------------------------
-- 6. RLS: deny-all, same as every other peer table
-- ---------------------------------------------------------------------------
ALTER TABLE public.peer_policies ENABLE ROW LEVEL SECURITY;
