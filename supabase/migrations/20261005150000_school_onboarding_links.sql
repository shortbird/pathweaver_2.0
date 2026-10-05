-- School setup links (2026-10-05).
--
-- Optio staff make a single-use link for a school operator. The operator opens
-- it, creates their own Optio account, and fills the school setup form; the
-- submission creates the organization and makes them its org_admin. One row is
-- one link: `used_at` / `organization_id` close it, and `answers` keeps every
-- answer the form collected, including the ones no organizations column holds
-- (student count, teaching approach, tools they want), so staff can read them
-- when they follow up.
--
-- RLS on with no policies: service role only. Every route gates the caller
-- first (superadmin to make or list links; any signed-in user holding an open
-- token to submit). Data API grants are inherited, so no per-table GRANT.

CREATE TABLE IF NOT EXISTS public.school_onboarding_links (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    token text NOT NULL UNIQUE,
    school_name_hint text,
    contact_email text,
    note text,
    created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
    revoked_at timestamptz,
    used_at timestamptz,
    used_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
    organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
    answers jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS school_onboarding_links_created_at_idx
    ON public.school_onboarding_links (created_at DESC);

ALTER TABLE public.school_onboarding_links ENABLE ROW LEVEL SECURITY;
