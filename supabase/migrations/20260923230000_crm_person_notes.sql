-- Internal notes about any Optio user, written from the CRM "People" tab and
-- the admin user modal. Lead notes (crm_events, event_type 'note') only reach
-- people who came in through a funnel; this covers everyone with an account.
--
-- The note belongs to the person it is about, so it goes with them when the
-- account is erased (CASCADE, and listed in user_erasure OWNED_ROWS). The
-- author is somebody else's authorship trail and only goes blank (SET NULL,
-- listed in ANONYMIZE_REFS).
CREATE TABLE IF NOT EXISTS public.crm_person_notes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    author_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
    body text NOT NULL CHECK (length(btrim(body)) > 0),
    -- The day of the meeting or call the note records, when there was one.
    met_on date,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS crm_person_notes_user_idx
    ON public.crm_person_notes (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS crm_person_notes_author_idx
    ON public.crm_person_notes (author_id);

-- Service-role only: RLS on, no policies (same posture as the other crm_*
-- tables). Every reader is behind require_superadmin.
ALTER TABLE public.crm_person_notes ENABLE ROW LEVEL SECURITY;
