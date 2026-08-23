-- In-house CRM core schema (docs/CRM_REPLACEMENT_PLAN.md, PR3).
--
-- Funnels and their email content are DB-backed (edited in the admin console
-- or by Claude via the admin API — no deploy per copy tweak). Leads are keyed
-- by lowercased email because most enter from anonymous marketing forms, long
-- before any users row exists. All tables are service-role only (RLS enabled,
-- zero policies), the same posture as contact_submissions: the public surface
-- is a handful of purpose-built routes, never the Data API.
--
-- Two constraints ARE the business rules, not just integrity checks:
--   * one active funnel per lead  -> partial unique index on memberships
--   * at-most-once step sends     -> UNIQUE(membership_id, step_id) on sends
--     (the sweep INSERTs a 'sending' claim before calling SendGrid; a unique
--     violation means another run owns the send)

-- Funnels: a named, ordered email sequence. 'nurture' funnels exit on
-- conversion; 'onboarding' funnels exist BECAUSE of conversion and don't.
CREATE TABLE public.crm_funnels (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    key text NOT NULL UNIQUE,
    name text NOT NULL,
    description text,
    status text NOT NULL DEFAULT 'paused'
        CHECK (status IN ('active', 'paused', 'archived')),
    funnel_type text NOT NULL DEFAULT 'nurture'
        CHECK (funnel_type IN ('nurture', 'onboarding')),
    -- contact_submissions.contact_type values that feed this funnel; the
    -- service layer enforces that a type maps to at most one funnel.
    entry_types text[] NOT NULL DEFAULT '{}',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- Steps: one row = one email in one funnel. Content lives HERE, not in a
-- shared template table — Brevo's template-vs-automation-copy divergence is
-- the failure mode that design kills. delay_hours counts from funnel ENTRY.
CREATE TABLE public.crm_funnel_steps (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    funnel_id uuid NOT NULL REFERENCES public.crm_funnels(id) ON DELETE CASCADE,
    step_order int NOT NULL,
    name text NOT NULL,
    subject text NOT NULL,
    html_body text NOT NULL,
    text_body text,
    delay_hours int NOT NULL CHECK (delay_hours >= 0),
    is_active boolean NOT NULL DEFAULT true,
    updated_at timestamptz NOT NULL DEFAULT now(),
    updated_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
    UNIQUE (funnel_id, step_order)
);

CREATE TABLE public.crm_leads (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email text NOT NULL UNIQUE CHECK (email = lower(email)),
    first_name text,
    last_name text,
    phone text,
    lead_type text,          -- contact_type at entry (or poe_parent, etc.)
    lead_source text,        -- contact_form | classes_lp | poe_signup | brevo_import | manual
    status text NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'converted', 'unsubscribed', 'suppressed')),
    converted_at timestamptz,
    conversion_event text,   -- account_signup | class_start | video_chat_scheduled | import | manual
    user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
    unsubscribe_token uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
    notes text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX crm_leads_status_idx ON public.crm_leads (status);

CREATE TABLE public.crm_funnel_memberships (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id uuid NOT NULL REFERENCES public.crm_leads(id) ON DELETE CASCADE,
    funnel_id uuid NOT NULL REFERENCES public.crm_funnels(id) ON DELETE CASCADE,
    entered_at timestamptz NOT NULL DEFAULT now(),
    status text NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'completed', 'exited')),
    exit_reason text,        -- converted_signup | converted_class_start | converted_video_chat
                             -- | unsubscribed | suppressed | manual | import_completed
    exited_at timestamptz,
    last_step_sent int NOT NULL DEFAULT 0,   -- highest step_order sent
    last_sent_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);
-- The one-funnel-per-lead rule. First funnel wins; races lose here, not in app code.
CREATE UNIQUE INDEX crm_memberships_one_active_per_lead
    ON public.crm_funnel_memberships (lead_id) WHERE status = 'active';
CREATE INDEX crm_memberships_funnel_status_idx
    ON public.crm_funnel_memberships (funnel_id, status);

CREATE TABLE public.crm_sends (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    membership_id uuid NOT NULL REFERENCES public.crm_funnel_memberships(id) ON DELETE CASCADE,
    lead_id uuid NOT NULL REFERENCES public.crm_leads(id) ON DELETE CASCADE,
    funnel_id uuid NOT NULL REFERENCES public.crm_funnels(id) ON DELETE CASCADE,
    step_id uuid NOT NULL REFERENCES public.crm_funnel_steps(id),
    email text NOT NULL,
    subject text,
    status text NOT NULL DEFAULT 'sending'
        CHECK (status IN ('sending', 'sent', 'failed')),
    provider_message_id text,
    error text,
    created_at timestamptz NOT NULL DEFAULT now(),
    sent_at timestamptz,
    -- The idempotency claim: a step goes to a membership at most once, ever.
    UNIQUE (membership_id, step_id)
);
CREATE INDEX crm_sends_lead_idx ON public.crm_sends (lead_id, created_at);

-- Raw SendGrid event webhook ledger (delivery/open/click/bounce/...).
CREATE TABLE public.crm_email_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    sg_event_id text UNIQUE,                 -- webhook redelivery dedupe
    send_id uuid REFERENCES public.crm_sends(id) ON DELETE SET NULL,
    lead_id uuid REFERENCES public.crm_leads(id) ON DELETE SET NULL,
    email text,
    event_type text NOT NULL,
    payload jsonb,
    occurred_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX crm_email_events_lead_idx ON public.crm_email_events (lead_id, occurred_at);

-- Marketing suppression. Gates CRM funnel mail ONLY — transactional email
-- (password resets, invites) is never suppressed.
CREATE TABLE public.crm_suppressions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email text NOT NULL UNIQUE CHECK (email = lower(email)),
    reason text NOT NULL
        CHECK (reason IN ('unsubscribe', 'hard_bounce', 'spam_report', 'manual')),
    source text,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- Per-lead timeline, rendered as-is by the admin console.
CREATE TABLE public.crm_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id uuid NOT NULL REFERENCES public.crm_leads(id) ON DELETE CASCADE,
    event_type text NOT NULL,
    detail jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX crm_events_lead_idx ON public.crm_events (lead_id, created_at);

-- Google Calendar poll idempotency: one conversion per (event, attendee).
CREATE TABLE public.crm_calendar_bookings (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    gcal_event_id text NOT NULL,
    attendee_email text NOT NULL,
    event_start timestamptz,
    matched_lead_id uuid REFERENCES public.crm_leads(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (gcal_event_id, attendee_email)
);

-- Engine settings: send_window, postal_address (CAN-SPAM footer — nurture
-- sends refuse to go out while this is missing), calendar_sync_token,
-- sweep_batch_cap.
CREATE TABLE public.crm_settings (
    key text PRIMARY KEY,
    value jsonb NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.crm_settings (key, value) VALUES
    ('send_window', '{"tz": "America/Denver", "start_hour": 9, "end_hour": 19}'),
    ('sweep_batch_cap', '50');

-- Service-role only: RLS on, no policies (same posture as contact_submissions).
ALTER TABLE public.crm_funnels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_funnel_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_funnel_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_sends ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_email_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_suppressions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_calendar_bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_settings ENABLE ROW LEVEL SECURITY;
