-- Re-privatize portfolios published on a minor's own self-consent, and stop it
-- recurring.
--
-- WHAT THE 2026-08-01 RESET MISSED
-- -------------------------------
-- The reset recorded in portfolio_visibility_reset_20260801 flipped 718 public
-- diplomas private in a single statement at 05:42:21Z. All 718 rows carry
-- had_consent = false: the rule was "public without consent -> private", and
-- anyone holding a consent record was spared.
--
-- It never asked WHO gave the consent. utils/portfolio_access.py does:
--
--     can_manage_privacy(caller, student):
--         superadmin                      -> allowed
--         caller is the student           -> allowed ONLY if not is_minor(student)
--         caller is the student's parent  -> allowed
--         org admin / assigned advisor    -> allowed
--
-- and is_minor() treats a missing date_of_birth as a minor, on purpose ("267
-- students of genuinely unknown age were classified as adults"). So a minor who
-- ticked the box themselves under the old model produced a consent record that
-- the reset accepted and that the application would refuse to create today.
--
-- Measured on production 2026-08-02 -- the four diplomas still is_public:
--
--   user      role           age       public_consent_given_by
--   5c608928  org student    17        005602a3  <- a linked parent. LEGITIMATE.
--   9b716f2b  platform stu.  unknown   themselves
--   aa0f3d00  org student    unknown   themselves
--   ad8e119c  superadmin     unknown   themselves  <- superadmin, exempt
--
-- Two student portfolios are world-readable on a minor's self-consent. Across
-- all diplomas, 4 of the 6 consent records are self-granted.
--
-- Note this is a SEPARATE defect from the RLS gap in
-- 20260802_revoke_data_api_on_student_work.sql. That migration stops the anon
-- key reading these tables; it does not change is_public, so without this file
-- the two portfolios stay public to every code path that still trusts the flag
-- -- and several do, e.g. routes/learning_events/evidence.py:278.
--
-- WHY A TRIGGER AND NOT JUST AN UPDATE
-- ------------------------------------
-- The application reads authorization through can_manage_privacy, but every
-- product write goes through Flask on the SERVICE-ROLE client, which bypasses
-- RLS entirely. RLS therefore cannot enforce this. A trigger is the only layer
-- that sees service-role writes, so it is the only place a database-side
-- guarantee can live.
--
-- Verified against both live publish paths before writing, neither of which
-- this blocks:
--   * routes/portfolio.py:475 -> make_portfolio_public(user_id,
--     consented_by=authenticated_user_id). Self-consent only when the caller IS
--     the student, which can_manage_privacy already restricts to adults.
--   * routes/parental_consent/visibility.py:175 sets
--     public_consent_given_by = the parent's id, so provenance differs from
--     user_id and the trigger is a no-op.
--   * make_portfolio_public_adult() self-consents, but has zero callers.
-- Both paths write is_public and public_consent_given_by in the same statement,
-- so the trigger never sees a half-populated row.

begin;

-- ---------------------------------------------------------------------------
-- The app's is_minor(), in SQL. Fails closed at every branch, including an
-- absent users row, so a dangling diploma cannot publish itself.
-- ---------------------------------------------------------------------------
create or replace function public.is_minor_for_publication(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (select case
       when u.is_dependent is true      then true
       when u.date_of_birth is null     then true   -- unknown age -> minor
       else ((current_date - u.date_of_birth)::numeric / 365.25) < 18
     end
     from public.users u
     where u.id = p_user_id),
    true)  -- no such user -> minor
$$;

comment on function public.is_minor_for_publication(uuid) is
  'Mirrors utils/portfolio_access.py::is_minor. Unknown age is a minor, not an '
  'adult. Change these two together or they will drift apart again.';

-- ---------------------------------------------------------------------------
-- Record what we are about to change, mirroring portfolio_visibility_reset_
-- 20260801 so this is inspectable and reversible.
-- ---------------------------------------------------------------------------
create table if not exists public.portfolio_visibility_reset_20260802 (
  user_id                 uuid primary key,
  portfolio_slug          text,
  was_public              boolean not null,
  consent_given_by        uuid,
  was_self_consented      boolean not null,
  was_minor               boolean not null,
  reset_at                timestamptz not null default now(),
  notified_at             timestamptz
);

-- Service-role only. Same treatment as the 20260801 table, whose 718 rows of
-- minor/consent flags were themselves world-readable until AUDIT.md C2.
alter table public.portfolio_visibility_reset_20260802 enable row level security;
alter table public.portfolio_visibility_reset_20260802 force row level security;
revoke all on public.portfolio_visibility_reset_20260802 from anon, authenticated, public;
grant all on public.portfolio_visibility_reset_20260802 to service_role;

insert into public.portfolio_visibility_reset_20260802
  (user_id, portfolio_slug, was_public, consent_given_by, was_self_consented, was_minor)
select d.user_id, d.portfolio_slug, d.is_public, d.public_consent_given_by, true, true
from public.diplomas d
join public.users u on u.id = d.user_id
where d.is_public
  and u.role is distinct from 'superadmin'
  and (d.public_consent_given_by is null or d.public_consent_given_by = d.user_id)
  and public.is_minor_for_publication(d.user_id)
on conflict (user_id) do nothing;

-- ---------------------------------------------------------------------------
-- Re-privatize. Set-based rather than by UUID so it stays correct if a row
-- changes between review and apply, and so re-running it is a no-op.
--
-- pending_parent_approval is deliberately NOT set here. Flipping these to
-- "awaiting a parent" would send approval prompts to parents who never asked
-- for anything; the student can request publication again through the normal
-- flow, which routes to a real approver via find_approver().
-- ---------------------------------------------------------------------------
update public.diplomas d
set is_public = false,
    public_consent_given = false
from public.users u
where u.id = d.user_id
  and d.is_public
  and u.role is distinct from 'superadmin'
  and (d.public_consent_given_by is null or d.public_consent_given_by = d.user_id)
  and public.is_minor_for_publication(d.user_id);

-- ---------------------------------------------------------------------------
-- Stop it recurring.
-- ---------------------------------------------------------------------------
create or replace function public.enforce_publication_consent_provenance()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role text;
begin
  if new.is_public is not true then
    return new;
  end if;

  -- Only evaluate when publication is being turned on, or when the recorded
  -- consenter changes. Unrelated updates to an already-public row (slug,
  -- issued_date) must not fail.
  if tg_op = 'UPDATE'
     and old.is_public is true
     and old.public_consent_given_by is not distinct from new.public_consent_given_by then
    return new;
  end if;

  select role into v_role from public.users where id = new.user_id;
  if v_role = 'superadmin' then
    return new;
  end if;

  -- Consent from someone other than the student (parent, org admin, advisor) is
  -- the normal path and is not second-guessed here; can_manage_privacy owns
  -- that question. This guard covers only the case the reset mishandled.
  if new.public_consent_given_by is null
     or new.public_consent_given_by = new.user_id then
    if public.is_minor_for_publication(new.user_id) then
      raise exception
        'Portfolio for user % cannot be published on self-consent: the student '
        'is a minor (or has no date of birth on file, which is treated as a '
        'minor). Publication requires consent from a parent or an accountable '
        'adult -- see utils/portfolio_access.py::find_approver.', new.user_id
        using errcode = 'check_violation';
    end if;
  end if;

  return new;
end
$$;

drop trigger if exists trg_publication_consent_provenance on public.diplomas;
create trigger trg_publication_consent_provenance
  before insert or update on public.diplomas
  for each row
  execute function public.enforce_publication_consent_provenance();

comment on trigger trg_publication_consent_provenance on public.diplomas is
  'A minor cannot consent to publishing their own portfolio. Enforced here '
  'rather than in RLS because every product write uses the service-role client, '
  'which bypasses RLS entirely.';

commit;

-- Verify after applying:
--   select count(*) from public.diplomas where is_public;          -- expect 2
--   select * from public.portfolio_visibility_reset_20260802;      -- expect 2 rows
--   python scripts/audit_db_exposure.py                            -- unchanged by
--     this file; the exposure drops out via the companion migration.
--
-- The two affected students should be told their portfolio is private again and
-- how to get it re-approved -- notified_at exists to track that.
