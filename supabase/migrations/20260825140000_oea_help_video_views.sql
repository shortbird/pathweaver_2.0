-- Who has opened the Hearthwood getting-started video.
--
-- The video is an external link (YouTube/Vimeo/Loom) that opens in a new tab,
-- so the platform cannot know whether anyone watched it — only that they asked
-- for it. This table records exactly that: the click. Everything built on it
-- (the Organization -> Settings counter, the per-parent list) says "opened",
-- never "watched", because that is the only claim the data supports.
--
-- One row per user, not per view: the question staff ask is "has this family
-- seen the walkthrough yet", so the row is the answer and open_count is the
-- colour. organization_id is denormalised off users at write time so the admin
-- read is one indexed query instead of a join against a 1000-row-capped users
-- page.

CREATE TABLE IF NOT EXISTS public.oea_help_video_views (
  user_id uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  first_opened_at timestamptz NOT NULL DEFAULT now(),
  last_opened_at timestamptz NOT NULL DEFAULT now(),
  open_count integer NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_oea_help_video_views_org
  ON public.oea_help_video_views (organization_id);

-- Deny-all RLS: reads and writes go through the Flask backend on the service
-- role, matching announcement_reads and the rest of the program tables.
ALTER TABLE public.oea_help_video_views ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.oea_help_video_views IS
  'One row per user who has opened the program getting-started video link. '
  'Records the click, not playback — the video is hosted off-platform.';
COMMENT ON COLUMN public.oea_help_video_views.open_count IS
  'How many times the link has been opened; the first open sets first_opened_at.';

-- Default Data API grants land automatically (20260527); pull the client-facing
-- ones back since this data is backend-only.
REVOKE ALL ON public.oea_help_video_views FROM anon, authenticated;
