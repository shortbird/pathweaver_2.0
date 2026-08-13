-- Beta bug-reporting: table + private storage bucket.
--
-- Backs the in-app "shake to report a bug" flow in the v2 mobile app. Each row
-- carries machine-actionable context (current route, recent API calls, console
-- errors, device/build) so Claude can read new reports via the Supabase MCP and
-- go straight to the failing code. Screenshots land in a PRIVATE bucket
-- (they may contain student data); they're viewed via a superadmin signed-URL
-- endpoint, never public.
--
-- Backend writes/reads via the admin client (Optio uses a custom JWT, not
-- Supabase auth.uid()), so RLS is enabled with no public policies: that denies
-- direct Data API / anon access while the admin client bypasses RLS. Default
-- data-API grants are already handled by 20260527_restore_default_data_api_grants.sql.

-- 1. Reports table
CREATE TABLE IF NOT EXISTS bug_reports (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               uuid REFERENCES users(id) ON DELETE SET NULL,
  user_email            text,
  user_role             text,
  message               text NOT NULL,
  steps                 text,
  status                text NOT NULL DEFAULT 'new'
                        CHECK (status IN ('new','triaged','fixing','resolved','wont_fix')),
  -- Build / environment
  app_version           text,
  build_number          text,
  ota_update_id         text,
  platform              text,
  os_version            text,
  device_model          text,
  -- Diagnostics
  current_route         text,
  breadcrumbs           jsonb,
  recent_api_calls      jsonb,
  recent_console_errors jsonb,
  sentry_event_id       text,
  -- Screenshot (private bucket)
  screenshot_path       text,
  screenshot_bucket     text,
  -- Misc / triage
  extra                 jsonb,
  triage_notes          text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  resolved_at           timestamptz
);

CREATE INDEX IF NOT EXISTS idx_bug_reports_status_created
  ON bug_reports(status, created_at DESC);

-- 2. RLS: enabled, no public policies. Admin-client only (RLS bypass).
ALTER TABLE bug_reports ENABLE ROW LEVEL SECURITY;

-- 3. Private storage bucket for screenshots. Not public; 10MB cap; images only.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'bug-reports',
  'bug-reports',
  false,
  10485760,  -- 10 * 1024 * 1024
  ARRAY['image/jpeg','image/png','image/webp']
)
ON CONFLICT (id) DO NOTHING;
