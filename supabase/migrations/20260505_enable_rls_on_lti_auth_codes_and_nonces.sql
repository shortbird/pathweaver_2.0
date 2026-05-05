-- Enable RLS on lti_auth_codes and lti_nonces to satisfy the Supabase security
-- linter (rls_disabled_in_public). Both tables are only ever read/written by
-- the backend via the admin (service role) client, which bypasses RLS, so no
-- policies are needed. This matches the existing lti_registrations pattern in
-- backend/migrations/007_create_lti_tables.sql, where RLS is enabled with no
-- policies for the same reason.

ALTER TABLE public.lti_auth_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lti_nonces     ENABLE ROW LEVEL SECURITY;
