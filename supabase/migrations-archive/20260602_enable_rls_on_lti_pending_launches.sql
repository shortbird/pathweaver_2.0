-- Enable RLS on lti_pending_launches to satisfy the Supabase security linter
-- (rls_disabled_in_public). This table stashes verified id_token claims for
-- not-yet-materialized launches and is only ever read/written by the backend
-- via the admin (service role) client, which bypasses RLS, so no policies are
-- needed. Matches the lti_auth_codes / lti_nonces / lti_registrations pattern
-- (see 20260505_enable_rls_on_lti_auth_codes_and_nonces.sql).

ALTER TABLE public.lti_pending_launches ENABLE ROW LEVEL SECURITY;
