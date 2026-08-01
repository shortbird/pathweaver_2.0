-- ============================================================================
-- Close three critical Data API exposures (audit 2026-08-01, AUDIT.md C1/C2/C3)
-- ============================================================================
--
-- C1: `organizations.feature_flags` holds per-org Stripe SECRET keys and the
--     calendar feed token. The `organizations_select` RLS policy is
--     `USING (is_active = true OR ...)`, and Postgres RLS filters ROWS, not
--     COLUMNS -- so the whole jsonb blob, secret included, was readable by the
--     anon role. The anon key ships in the public JS bundle, so this was an
--     unauthenticated read for anyone on the internet.
--
-- C2: `portfolio_visibility_reset_20260801` (718 rows of per-student minor /
--     consent flags) and `sis_billing_audit` were created without RLS. The
--     blanket default privileges from 20260527_restore_default_data_api_grants
--     then granted anon SELECT/INSERT/UPDATE/DELETE/TRUNCATE on both.
--
-- C3 is fixed in application code (`routes/auth/login/core.py` now whitelists
--     the organization payload instead of returning feature_flags verbatim),
--     but this migration is what makes that fix durable: once the secrets are
--     out of `feature_flags` entirely, no future serializer can leak them by
--     forgetting to strip a field.
--
-- Ordering note: this migration MUST land together with the application code
-- that reads secrets from `organization_secrets` (utils/org_secrets.py). Applying
-- it against an older backend breaks the iCreate card-payment step, because the
-- key disappears from feature_flags before anything knows to look elsewhere.
--
-- Safe to re-run.

begin;

-- ---------------------------------------------------------------------------
-- 1) A table for org-scoped secrets that is never exposed to the Data API.
--    RLS on with ZERO policies = deny-all for anon/authenticated; the backend
--    reaches it with the service-role client, which bypasses RLS. The explicit
--    REVOKE is belt-and-braces against the ALTER DEFAULT PRIVILEGES rule.
-- ---------------------------------------------------------------------------
create table if not exists public.organization_secrets (
  organization_id uuid  not null references public.organizations(id) on delete cascade,
  name            text  not null,
  value           text  not null,
  updated_at      timestamptz not null default now(),
  updated_by      uuid  references public.users(id) on delete set null,
  primary key (organization_id, name)
);

comment on table public.organization_secrets is
  'Org-scoped credentials (Stripe secret keys, calendar feed tokens). Never exposed '
  'to PostgREST: RLS is on with no policies and all grants are revoked. Read/write '
  'only via the service-role client through backend/utils/org_secrets.py. Do NOT '
  'put credentials back into organizations.feature_flags -- that column is '
  'anon-readable by row policy and is echoed to clients.';

alter table public.organization_secrets enable row level security;
alter table public.organization_secrets force row level security;

revoke all on public.organization_secrets from anon, authenticated, public;
grant  all on public.organization_secrets to service_role;

-- ---------------------------------------------------------------------------
-- 2) Move the two known secrets out of feature_flags.
--    Copy first, strip second, so an interrupted run never loses the key.
-- ---------------------------------------------------------------------------
insert into public.organization_secrets (organization_id, name, value)
select id, 'stripe_secret_key', feature_flags->'icreate_registration'->>'stripe_secret_key'
from public.organizations
where nullif(feature_flags->'icreate_registration'->>'stripe_secret_key', '') is not null
on conflict (organization_id, name)
  do update set value = excluded.value, updated_at = now();

insert into public.organization_secrets (organization_id, name, value)
select id, 'calendar_feed_token', feature_flags->'sis_settings'->>'calendar_feed_token'
from public.organizations
where nullif(feature_flags->'sis_settings'->>'calendar_feed_token', '') is not null
on conflict (organization_id, name)
  do update set value = excluded.value, updated_at = now();

update public.organizations
set feature_flags = jsonb_set(
      feature_flags,
      '{icreate_registration}',
      (feature_flags->'icreate_registration') - 'stripe_secret_key'
    )
where jsonb_typeof(feature_flags->'icreate_registration') = 'object'
  and (feature_flags->'icreate_registration') ? 'stripe_secret_key';

update public.organizations
set feature_flags = jsonb_set(
      feature_flags,
      '{sis_settings}',
      (feature_flags->'sis_settings') - 'calendar_feed_token'
    )
where jsonb_typeof(feature_flags->'sis_settings') = 'object'
  and (feature_flags->'sis_settings') ? 'calendar_feed_token';

-- ---------------------------------------------------------------------------
-- 3) Defense in depth for C1: stop handing `feature_flags` (and any future
--    column) to anon/authenticated at all. RLS cannot express "these columns",
--    so express it with column-level GRANTs instead: revoke the table-wide
--    SELECT and re-grant only the columns clients legitimately read.
--
--    Safe because no client queries this table directly -- the anon key is used
--    only for OAuth, realtime and storage (frontend/src/services/supabaseClient.js,
--    frontend-v2/src/services/supabaseClient.ts). Every organization read in the
--    product goes through the Flask backend on the service-role client.
--
--    Adding a column later does NOT silently expose it: new columns are not
--    covered by a column-level grant, so they default to invisible. That is the
--    behaviour we want.
-- ---------------------------------------------------------------------------
revoke select on public.organizations from anon, authenticated;
grant select (
  id, name, slug, is_active, timezone,
  branding_config, quest_visibility_policy, course_visibility_policy,
  accreditation_source, created_at, updated_at,
  ai_features_enabled, ai_chatbot_enabled, ai_lesson_helper_enabled,
  ai_task_generation_enabled
) on public.organizations to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4) C2: the two tables that shipped without RLS.
--
--    Both are written only by the backend's service-role client, so enabling
--    RLS with no policies takes nothing away from the application. Grants are
--    revoked explicitly as well: RLS alone would stop reads, but leaving
--    TRUNCATE granted to anon is not something to rely on a policy to catch.
-- ---------------------------------------------------------------------------
alter table public.portfolio_visibility_reset_20260801 enable row level security;
alter table public.portfolio_visibility_reset_20260801 force row level security;
revoke all on public.portfolio_visibility_reset_20260801 from anon, authenticated, public;
grant  all on public.portfolio_visibility_reset_20260801 to service_role;

comment on table public.portfolio_visibility_reset_20260801 is
  'Pre-reset snapshot from the 2026-08-01 private-by-default migration. Contains '
  'per-student minor/consent flags -- service-role only, never expose to the Data API.';

alter table public.sis_billing_audit enable row level security;
alter table public.sis_billing_audit force row level security;
revoke all on public.sis_billing_audit from anon, authenticated, public;
grant  all on public.sis_billing_audit to service_role;

commit;

-- ---------------------------------------------------------------------------
-- Verification (expect zero rows from each):
--
--   -- no public table without RLS
--   select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
--   where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;
--
--   -- no secret left in feature_flags
--   select id from public.organizations
--   where feature_flags::text ~* '(secret|password|api_?key|_token)"\s*:\s*"[^"]';
--
--   -- anon cannot see the feature_flags column
--   select 1 from information_schema.column_privileges
--   where table_schema = 'public' and table_name = 'organizations'
--     and column_name = 'feature_flags' and grantee in ('anon', 'authenticated');
-- ---------------------------------------------------------------------------
