-- Community Hub tables for the SIS console (Announcements, Lost & Found, Recognition).
-- Staff/service-role-only via RLS deny-all (like sis_events): the backend uses
-- get_supabase_admin_client() and authorizes in-route via require_role. No policies
-- are added, so anon/authenticated PostgREST access is denied by default. The org's
-- default-privileges rule auto-grants these new public tables, so no explicit GRANTs.

CREATE TABLE IF NOT EXISTS public.sis_announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  title text NOT NULL,
  body text,
  pinned boolean NOT NULL DEFAULT false,
  priority text NOT NULL DEFAULT 'normal',   -- normal | urgent
  publish_at timestamptz,
  expires_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sis_announcements_org
  ON public.sis_announcements(organization_id, created_at DESC);
ALTER TABLE public.sis_announcements ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.sis_lost_found (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  description text NOT NULL,
  image_url text,
  category text,
  date_found date,
  location_found text,
  status text NOT NULL DEFAULT 'unclaimed',  -- unclaimed | claimed | donated
  claimed_by text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sis_lost_found_org
  ON public.sis_lost_found(organization_id, created_at DESC);
ALTER TABLE public.sis_lost_found ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.sis_recognition (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  type text NOT NULL DEFAULT 'shout_out',    -- shout_out | student_spotlight | volunteer | weekly_win | thank_you
  recipient_name text,
  recipient_user_id uuid,
  message text NOT NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sis_recognition_org
  ON public.sis_recognition(organization_id, created_at DESC);
ALTER TABLE public.sis_recognition ENABLE ROW LEVEL SECURITY;
