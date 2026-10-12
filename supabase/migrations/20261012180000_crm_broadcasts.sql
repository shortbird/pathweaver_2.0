-- Mail-merge sends from /admin/crm/lists.
--
-- A superadmin picks a list, writes one email with {{variables}} (first name,
-- children, school, and a per-school billing sheet: student count, price,
-- amount due), and Optio sends one personal copy per person through SendGrid.
-- The first use is a monthly "here is what you will be billed" note to school
-- admins.
--
-- crm_broadcasts is the email as written (subject, body, the billing sheet as
-- it stood when sent); crm_broadcast_recipients is one row per person with the
-- outcome, written BEFORE the send so a retry or a double click cannot mail
-- anyone twice (unique per broadcast and address).
--
-- Service-role only, like every crm_* table: RLS on, no policies, every route
-- behind require_superadmin.

CREATE TABLE IF NOT EXISTS public.crm_broadcasts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    subject text NOT NULL CHECK (length(btrim(subject)) > 0),
    body text NOT NULL,
    list_id uuid REFERENCES public.crm_email_lists(id) ON DELETE SET NULL,
    list_name text,
    sender_name text,
    reply_to text,
    billing_month text,
    sheet jsonb NOT NULL DEFAULT '{}'::jsonb,
    status text NOT NULL DEFAULT 'sending' CHECK (status IN ('sending', 'sent', 'failed')),
    recipient_count integer NOT NULL DEFAULT 0,
    sent_count integer NOT NULL DEFAULT 0,
    failed_count integer NOT NULL DEFAULT 0,
    skipped_count integer NOT NULL DEFAULT 0,
    created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    finished_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.crm_broadcast_recipients (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    broadcast_id uuid NOT NULL REFERENCES public.crm_broadcasts(id) ON DELETE CASCADE,
    user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
    email text NOT NULL,
    name text,
    status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'sent', 'failed', 'skipped')),
    reason text,
    provider_message_id text,
    subject text,
    created_at timestamptz NOT NULL DEFAULT now(),
    sent_at timestamptz,
    UNIQUE (broadcast_id, email)
);

CREATE INDEX IF NOT EXISTS crm_broadcast_recipients_broadcast_idx
    ON public.crm_broadcast_recipients (broadcast_id);
CREATE INDEX IF NOT EXISTS crm_broadcasts_created_at_idx
    ON public.crm_broadcasts (created_at DESC);

ALTER TABLE public.crm_broadcasts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_broadcast_recipients ENABLE ROW LEVEL SECURITY;
