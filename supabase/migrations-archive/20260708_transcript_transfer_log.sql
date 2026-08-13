-- Audit log of official transcript transfers sent to external schools.
-- Written by the backend (service role) from the admin transcript generator's
-- "Transfer to School" flow. No RLS policies: all access goes through the
-- Flask backend with the admin client; direct Data API access is not used.

CREATE TABLE IF NOT EXISTS public.transcript_transfer_log (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    sent_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
    school_name text NOT NULL,
    recipient_name text,
    recipient_email text NOT NULL,
    message text,
    status text NOT NULL DEFAULT 'sent',
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_transcript_transfer_log_user
    ON public.transcript_transfer_log (user_id, created_at DESC);

ALTER TABLE public.transcript_transfer_log ENABLE ROW LEVEL SECURITY;
