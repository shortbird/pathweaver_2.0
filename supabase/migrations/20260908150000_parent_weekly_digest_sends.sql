-- One row per parent per week, so the weekly digest is sent once.
--
-- Dallin Bird (Gryffin), 2026-09-07: parents are not logging in to see how
-- their child is doing, so the school wants the week to arrive by email.
--
-- The cron dispatcher runs every ~10 minutes, and the digest fires on the hour
-- the school picked. That is six ticks inside the send window, so without a
-- record of what already went out a family would receive the same digest six
-- times. The unique constraint IS the guard: the insert is attempted before the
-- send, and a duplicate-key error means another tick already has it.
--
-- Keyed on the LOCAL week date, not a timestamp: "the Sunday the school means"
-- is a date in the school's own timezone, and it is the same date for every
-- tick inside the window.

CREATE TABLE IF NOT EXISTS public.parent_digest_sends (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    parent_user_id  uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    -- The local date of the send window this row claims.
    week_date       date NOT NULL,
    sent_at         timestamptz NOT NULL DEFAULT now(),
    -- Whether the provider accepted the message. A false row still holds the
    -- slot: a send that failed is retried next week, not six minutes later.
    delivered       boolean NOT NULL DEFAULT true,
    -- What went out, for answering "what did we tell this family?" without
    -- reconstructing it from the source tables weeks later.
    child_count     integer NOT NULL DEFAULT 0,
    task_count      integer NOT NULL DEFAULT 0,
    late_count      integer NOT NULL DEFAULT 0,
    CONSTRAINT parent_digest_sends_once_per_week
        UNIQUE (organization_id, parent_user_id, week_date)
);

CREATE INDEX IF NOT EXISTS idx_parent_digest_sends_org_week
    ON public.parent_digest_sends (organization_id, week_date DESC);

-- Deny-all RLS. Only the backend service role reads or writes this; it is
-- delivery bookkeeping about minors' families and has no client surface.
ALTER TABLE public.parent_digest_sends ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.parent_digest_sends FROM anon, authenticated;

COMMENT ON TABLE public.parent_digest_sends IS
  'One row per (org, parent, local week date) for the weekly parent digest. The unique constraint is the send-once guard for a cron that ticks every 10 minutes inside the send hour.';
