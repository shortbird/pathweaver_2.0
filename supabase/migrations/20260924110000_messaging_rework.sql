-- Messaging rework (iCreate meeting 2026-09-23, phase P5).
--
-- Tickets bf8b754d (compose like an inbox, messages become tasks), d93b24d2
-- (a staff member assigned a thread can read and answer it), 8ee000b6 (a class's
-- teacher, aide and students as recipients), 9a335881 (announcements are
-- multi-role and live on Community), 9b46c748 (read receipts).
--
-- ADDITIVE ONLY. Production runs the old code until the release: new tables,
-- new nullable columns, new views. Nothing here rewrites a row, so there is no
-- _release_ file. Apply BEFORE the new code deploys (and before the owner
-- verifies at localhost, which reads production): the new code writes
-- sis_announcements.audiences and reads the new tables.
--
-- Every new table is service-role only (RLS on, no policies), like the rest of
-- messaging: the Flask backend checks the caller and reads with the admin
-- client. Data API grants are inherited; the views are pulled back from anon
-- and authenticated the way announcement_read_stats is (20260823000000).

-- ── One compose, recorded ───────────────────────────────────────────────────
-- A send to many people from the console's Compose. Without a row for the send
-- itself, "Read by 12 of 40" has no denominator: the recipients are spread over
-- forty conversations (or one group) with nothing tying them together.
CREATE TABLE IF NOT EXISTS public.message_sends (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    sent_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
    -- Sent from the School tab (the school's name) or from My messages.
    as_school boolean NOT NULL DEFAULT false,
    -- 'group': one thread everyone replies in; 'separate': a private thread each.
    mode text NOT NULL CHECK (mode = ANY (ARRAY['group'::text, 'separate'::text])),
    subject text,
    body text NOT NULL DEFAULT '',
    -- The Optio message is always stored; these are the per-send channel toggles.
    push boolean NOT NULL DEFAULT true,
    email boolean NOT NULL DEFAULT false,
    group_id uuid REFERENCES public.group_conversations(id) ON DELETE SET NULL,
    group_message_id uuid REFERENCES public.group_messages(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS message_sends_org_created_idx
    ON public.message_sends (organization_id, created_at DESC);

ALTER TABLE public.message_sends ENABLE ROW LEVEL SECURITY;

-- Who one send went to. `message_id` is the direct message a separate send
-- wrote for this person (NULL for a group send, whose one message is on the
-- send row). `status` 'skipped' keeps the person nobody could reach in the
-- list, so the office sees the gap instead of a smaller number.
CREATE TABLE IF NOT EXISTS public.message_send_recipients (
    send_id uuid NOT NULL REFERENCES public.message_sends(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    kind text NOT NULL DEFAULT 'staff'
        CHECK (kind = ANY (ARRAY['staff'::text, 'family'::text, 'student'::text])),
    conversation_id uuid REFERENCES public.message_conversations(id) ON DELETE SET NULL,
    message_id uuid REFERENCES public.direct_messages(id) ON DELETE SET NULL,
    status text NOT NULL DEFAULT 'sent'
        CHECK (status = ANY (ARRAY['sent'::text, 'skipped'::text])),
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (send_id, user_id)
);

CREATE INDEX IF NOT EXISTS message_send_recipients_message_idx
    ON public.message_send_recipients (message_id) WHERE message_id IS NOT NULL;

ALTER TABLE public.message_send_recipients ENABLE ROW LEVEL SECURITY;

-- When each recipient read the send. A separate send is read when its direct
-- message has read_at; a group send is read by a member whose last_read_at is
-- at or after the send's message. Computed in Postgres so the Sent list never
-- pulls a recipient row per person into Python (PostgREST truncates at 1000).
CREATE OR REPLACE VIEW public.message_send_recipient_status
WITH (security_invoker = true) AS
SELECT
    r.send_id,
    r.user_id,
    r.kind,
    r.status,
    r.conversation_id,
    CASE
        WHEN r.status <> 'sent' THEN NULL
        WHEN r.message_id IS NOT NULL THEN dm.read_at
        WHEN gm.last_read_at IS NOT NULL AND gm.last_read_at >= gmsg.created_at
            THEN gm.last_read_at
        ELSE NULL
    END AS read_at
FROM public.message_send_recipients r
JOIN public.message_sends s ON s.id = r.send_id
LEFT JOIN public.direct_messages dm ON dm.id = r.message_id
LEFT JOIN public.group_messages gmsg ON gmsg.id = s.group_message_id
LEFT JOIN public.group_members gm ON gm.group_id = s.group_id AND gm.user_id = r.user_id;

CREATE OR REPLACE VIEW public.message_send_read_stats
WITH (security_invoker = true) AS
SELECT
    st.send_id,
    count(*) FILTER (WHERE st.status = 'sent') AS recipient_count,
    count(*) FILTER (WHERE st.read_at IS NOT NULL) AS read_count,
    count(*) FILTER (WHERE st.status = 'skipped') AS skipped_count
FROM public.message_send_recipient_status st
GROUP BY st.send_id;

REVOKE ALL ON public.message_send_recipient_status FROM anon, authenticated;
REVOKE ALL ON public.message_send_read_stats FROM anon, authenticated;

-- ── A thread handed to a staff member ───────────────────────────────────────
-- "Make a task" in the school inbox: the task is the assignment, and this row
-- is the access that comes with it. A teacher has no school inbox; with an
-- active grant they open that one thread in the console and answer it as the
-- school. Active means revoked_at IS NULL and the task still exists and is not
-- finished -- the backend checks the task on every read, so completing or
-- deleting it ends the access without anybody having to remember to revoke.
-- ON DELETE SET NULL (not CASCADE) on task_id keeps the record of who was let
-- into which thread after the task is gone.
CREATE TABLE IF NOT EXISTS public.school_thread_grants (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    conversation_id uuid REFERENCES public.message_conversations(id) ON DELETE CASCADE,
    group_id uuid REFERENCES public.group_conversations(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    task_id uuid REFERENCES public.sis_onboarding_assignments(id) ON DELETE SET NULL,
    granted_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    revoked_at timestamptz,
    CONSTRAINT school_thread_grants_one_thread
        CHECK ((conversation_id IS NULL) <> (group_id IS NULL))
);

CREATE INDEX IF NOT EXISTS school_thread_grants_user_active_idx
    ON public.school_thread_grants (user_id) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS school_thread_grants_task_idx
    ON public.school_thread_grants (task_id) WHERE task_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS school_thread_grants_conversation_idx
    ON public.school_thread_grants (conversation_id) WHERE conversation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS school_thread_grants_group_idx
    ON public.school_thread_grants (group_id) WHERE group_id IS NOT NULL;

ALTER TABLE public.school_thread_grants ENABLE ROW LEVEL SECURITY;

-- ── Which staff member opened a school thread ───────────────────────────────
-- The school inbox's read state is shared (direct_messages.read_at on the
-- school's messages says SOMEBODY in the office opened it). This says who.
-- One row per person per thread; last_read_at moves on each open.
CREATE TABLE IF NOT EXISTS public.school_thread_reads (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    conversation_id uuid REFERENCES public.message_conversations(id) ON DELETE CASCADE,
    group_id uuid REFERENCES public.group_conversations(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    first_read_at timestamptz NOT NULL DEFAULT now(),
    last_read_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT school_thread_reads_one_thread
        CHECK ((conversation_id IS NULL) <> (group_id IS NULL)),
    -- Plain UNIQUE constraints (NULLs are distinct) so an upsert can name them.
    CONSTRAINT school_thread_reads_conversation_user_key UNIQUE (conversation_id, user_id),
    CONSTRAINT school_thread_reads_group_user_key UNIQUE (group_id, user_id)
);

ALTER TABLE public.school_thread_reads ENABLE ROW LEVEL SECURITY;

-- ── "<Teacher> for <School>" ────────────────────────────────────────────────
-- A reply a granted teacher sends goes out as the school, and the family is
-- told who wrote it. The office's own replies stay under the school's name
-- alone, as before, so the flag is per message rather than inferred from
-- sent_by_user_id. NULL reads as false; old code never writes it.
ALTER TABLE public.direct_messages
    ADD COLUMN IF NOT EXISTS show_sender_name boolean;

-- ── Announcements for several roles ─────────────────────────────────────────
-- The board audience was one word (school | families | teachers). A post can
-- now name any mix of parents, students and teachers. The old single column
-- stays and keeps being written (the nearest word that covers the roles), so
-- old code and the mobile app read what they always read; new code reads
-- `audiences` and falls back to `audience` for rows written before this.
ALTER TABLE public.sis_announcements
    ADD COLUMN IF NOT EXISTS audiences text[];

ALTER TABLE public.sis_announcements
    DROP CONSTRAINT IF EXISTS sis_announcements_audiences_check;
ALTER TABLE public.sis_announcements
    ADD CONSTRAINT sis_announcements_audiences_check
    CHECK (audiences IS NULL OR audiences <@ ARRAY['parents'::text, 'students'::text, 'teachers'::text]);
