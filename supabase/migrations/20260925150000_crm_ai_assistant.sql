-- CRM AI assistant, phase 1 (docs/CRM_AI_ASSISTANT_PLAN.md): the connected
-- Gmail mailbox, the email it syncs, to-dos, drafts, per-contact profiles and
-- the daily digest.
--
-- A contact is an email address. Every table here keys on the lowercased
-- email, resolved to a lead or a user only when read, so a person who is both
-- a lead and a user has one history.
--
-- Service-role only: RLS on, no policies, like every crm_* table. Every
-- reader is behind require_superadmin or the cron secret.

-- The one connected mailbox. Holds an OAuth refresh token, so grants are also
-- revoked: unreachable through PostgREST by construction.
CREATE TABLE IF NOT EXISTS public.crm_mail_accounts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email text NOT NULL UNIQUE CHECK (email = lower(email)),
    refresh_token text NOT NULL,
    scopes text,
    history_id text,
    connected_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
    connected_at timestamptz NOT NULL DEFAULT now(),
    last_sync_at timestamptz,
    last_error text,
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- Email with a known contact on it. Nothing else from the mailbox is stored.
CREATE TABLE IF NOT EXISTS public.crm_messages (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    gmail_message_id text NOT NULL UNIQUE,
    thread_id text NOT NULL,
    rfc_message_id text,
    direction text NOT NULL CHECK (direction IN ('inbound', 'outbound')),
    from_email text NOT NULL,
    to_emails text[] NOT NULL DEFAULT '{}',
    cc_emails text[] NOT NULL DEFAULT '{}',
    -- The known contacts on the message; what the timeline filters on.
    contact_emails text[] NOT NULL DEFAULT '{}',
    subject text,
    snippet text,
    body_text text,
    sent_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS crm_messages_contacts_idx
    ON public.crm_messages USING gin (contact_emails);
CREATE INDEX IF NOT EXISTS crm_messages_thread_idx
    ON public.crm_messages (thread_id, sent_at);
CREATE INDEX IF NOT EXISTS crm_messages_sent_at_idx
    ON public.crm_messages (sent_at DESC);

CREATE TABLE IF NOT EXISTS public.crm_tasks (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    contact_email text NOT NULL CHECK (contact_email = lower(contact_email)),
    title text NOT NULL CHECK (length(btrim(title)) > 0),
    detail text,
    due_on date,
    status text NOT NULL DEFAULT 'open'
        CHECK (status IN ('suggested', 'open', 'done', 'dismissed')),
    -- manual | ai_note | ai_email | ai_digest
    source text NOT NULL DEFAULT 'manual',
    source_ref text,
    created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
    completed_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS crm_tasks_contact_idx
    ON public.crm_tasks (contact_email, status);
CREATE INDEX IF NOT EXISTS crm_tasks_due_idx
    ON public.crm_tasks (status, due_on);

-- A draft is never sent by anything but the send route, which only a
-- signed-in superadmin can reach. There is deliberately no scheduled state;
-- 'sending' is the claim that stops a double click sending twice.
CREATE TABLE IF NOT EXISTS public.crm_drafts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    contact_email text NOT NULL CHECK (contact_email = lower(contact_email)),
    to_email text NOT NULL,
    subject text NOT NULL DEFAULT '',
    body_text text NOT NULL DEFAULT '',
    -- Set when the draft replies in an existing thread.
    thread_id text,
    in_reply_to text,
    -- Why the draft exists, in one line (shown in the digest).
    reason text,
    -- 'ai' or 'manual'
    origin text NOT NULL DEFAULT 'manual',
    status text NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'sending', 'sent', 'discarded')),
    gmail_message_id text,
    sent_at timestamptz,
    sent_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS crm_drafts_contact_idx
    ON public.crm_drafts (contact_email, status);

-- What the CRM knows about a contact beyond their rows: cadence tier, the
-- AI's structured read of the relationship, snoozes. Phase 2 fills most of it.
CREATE TABLE IF NOT EXISTS public.crm_contact_profiles (
    email text PRIMARY KEY CHECK (email = lower(email)),
    -- client | hot | warm | cold
    tier text CHECK (tier IN ('client', 'hot', 'warm', 'cold')),
    tier_source text NOT NULL DEFAULT 'ai' CHECK (tier_source IN ('ai', 'manual')),
    summary text,
    facts jsonb NOT NULL DEFAULT '{}',
    outcome text,
    outcome_reason text,
    snoozed_until date,
    analyzed_at timestamptz,
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.crm_digests (
    digest_date date PRIMARY KEY,
    items jsonb NOT NULL DEFAULT '[]',
    emailed_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.crm_mail_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_contact_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_digests ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.crm_mail_accounts FROM anon, authenticated;
