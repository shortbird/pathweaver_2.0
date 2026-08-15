-- Refresh-token rotation with reuse detection (2026-08-15).
--
-- Before this, /api/auth/refresh minted a NEW access+refresh pair and left the
-- OLD refresh token valid until its own 30-day expiry. The tokens are stateless
-- and there is no denylist, so a refresh token copied off a device (or read out
-- of a JSON response by an XSS payload) worked alongside the victim's for up to
-- a month, and nothing anywhere could notice that two parties were using the
-- same credential.
--
-- The fix is the standard OAuth 2.1 refresh-token rotation: every refresh token
-- carries a family id (`fam`) and a one-time id (`jti`), and this table records
-- which jti is currently live for each family. Presenting the family's current
-- jti rotates it. Presenting any OTHER jti of the same family means a token that
-- was already spent is being replayed -- so the whole family is revoked and both
-- the attacker and the victim are logged out, which is the only safe outcome
-- when we cannot tell which of the two is the legitimate holder.
--
-- `previous_jti` + `rotated_at` exist for a benign version of the same event:
-- two browser tabs refreshing within milliseconds of each other both present
-- the same jti, and without a grace window that would look identical to a
-- replay and sign the user out of a session nobody attacked.
--
-- This table is a REVOCATION mechanism, not a session store. `users.last_logout_at`
-- remains the platform-wide revocation stamp (logout, password change, password
-- reset); this narrows the window for one stolen token rather than replacing it.

create table if not exists public.refresh_token_families (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  -- The only jti that may be presented next. Rotated on every refresh.
  current_jti uuid not null,

  -- The jti this family held immediately before `rotated_at`. Accepted, without
  -- revoking anything, for a few seconds after rotation so concurrent tabs do
  -- not look like an attack.
  previous_jti uuid,
  rotated_at timestamptz,

  issued_at timestamptz not null default now(),
  last_used_at timestamptz not null default now(),

  -- Mirrors the refresh token's own `exp`. A family is dead once every token
  -- that could belong to it has expired, which is what makes cleanup bounded.
  expires_at timestamptz not null,

  revoked boolean not null default false,
  revoked_at timestamptz,
  revoked_reason text,

  created_at timestamptz not null default now()
);

-- Rotation reads by primary key; these cover the other two access patterns.
create index if not exists idx_refresh_token_families_user
  on public.refresh_token_families (user_id) where revoked = false;

create index if not exists idx_refresh_token_families_expires
  on public.refresh_token_families (expires_at);

-- No client ever touches this table: the backend reads and writes it through
-- the service-role client, which bypasses RLS. RLS on with no policies is
-- deny-by-default, matching the other credential tables (password_reset_tokens
-- keeps a service_role-only policy for the same reason).
alter table public.refresh_token_families enable row level security;

drop policy if exists "Service role can manage refresh token families"
  on public.refresh_token_families;
create policy "Service role can manage refresh token families"
  on public.refresh_token_families for all to public
  using ((select auth.role()) = 'service_role');

comment on table public.refresh_token_families is
  'One row per refresh-token chain. current_jti is the only token id that may be '
  'presented next; presenting a superseded jti is a replay and revokes the family. '
  'Rows are deleted once expired -- see cleanup_expired_refresh_token_families().';

-- ---------------------------------------------------------------------------
-- Cleanup
-- ---------------------------------------------------------------------------
-- The table gains a row per login and never shrinks on its own, so it needs a
-- reaper or it grows without bound. Deleting is safe once `expires_at` has
-- passed by a margin: every token that could name the family is expired by then,
-- so the row can no longer answer any question.
--
-- Bounded on purpose. An unqualified DELETE over a table this size would take a
-- long lock on a hot path; `p_limit` keeps each call short, and the caller
-- (backend/utils/refresh_families.py, once an hour per worker) simply runs it
-- again later. Returns the number deleted so the caller can log it.
create or replace function public.cleanup_expired_refresh_token_families(
  p_limit integer default 5000
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  deleted_count integer;
begin
  with doomed as (
    select id from public.refresh_token_families
    where expires_at < now() - interval '7 days'
    limit greatest(1, least(coalesce(p_limit, 5000), 50000))
  )
  delete from public.refresh_token_families f
  using doomed d
  where f.id = d.id;

  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

-- SECURITY DEFINER + the default Data API grants would publish this as
-- /rest/v1/rpc/cleanup_expired_refresh_token_families to anon and authenticated.
-- It is a backend maintenance call; only the service role may run it.
revoke all on function public.cleanup_expired_refresh_token_families(integer) from public;
revoke all on function public.cleanup_expired_refresh_token_families(integer) from anon;
revoke all on function public.cleanup_expired_refresh_token_families(integer) from authenticated;
grant execute on function public.cleanup_expired_refresh_token_families(integer) to service_role;
