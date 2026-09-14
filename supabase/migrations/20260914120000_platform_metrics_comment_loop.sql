-- The comment loop, on the superadmin home: who is answering whom.
--
-- Sixteen comments in the life of observer_comments as of 2026-09-14,
-- fourteen of them by superadmin. Not one reply from a student, not one
-- comment from a parent -- both were refused by a permission predicate for
-- months, and half of the fourteen never produced a notification. Nothing
-- showed it, because a refused comment is a 403 and an unsent notification is
-- nothing at all: an empty table looks exactly like a feature nobody uses.
--
-- Two new columns on the daily series split every comment by who wrote it:
--   comments_platform   superadmin, or a designated Optio staff account
--   comments_community  everyone else -- students, families, schools
-- The second is the number. The platform can talk to itself indefinitely; the
-- loop is closed only when the community line is above zero.
--
-- The designated staff accounts are a Config list the database cannot see
-- (Config.PLATFORM_STAFF_EMAILS), so they arrive as a parameter from the route
-- and "Optio" means the same thing on this chart as it does in the thread
-- (utils/platform_staff.is_optio_platform_user). Superadmin qualifies by role
-- regardless, so an empty array is safe and degrades to "superadmin only".
--
-- The return type changes, which create-or-replace cannot do: drop first.

drop function if exists public.admin_platform_metrics_daily(integer);

create or replace function public.admin_platform_metrics_daily(
  p_days integer default 30,
  p_platform_emails text[] default '{}'
)
returns table (
  day date,
  signups bigint,
  dau bigint,
  task_completions bigint,
  quest_starts bigint,
  evidence_uploads bigint,
  reg_success bigint,
  reg_failed bigint,
  login_success bigint,
  login_failed bigint,
  sis_payment_cents bigint,
  comments_platform bigint,
  comments_community bigint
)
language sql
stable
as $$
  with bounds as (
    select ((now() at time zone 'utc')::date
              - (least(greatest(coalesce(p_days, 30), 1), 90) - 1)) as start_day,
           (now() at time zone 'utc')::date as end_day
  ),
  days as (
    select generate_series(b.start_day, b.end_day, interval '1 day')::date as day
    from bounds b
  ),
  signup_counts as (
    select (u.created_at at time zone 'utc')::date as day, count(*) as n
    from users u, bounds b
    where u.created_at >= b.start_day::timestamptz
    group by 1
  ),
  events as (
    select (e.created_at at time zone 'utc')::date as day, e.event_type, e.user_id
    from user_activity_events e, bounds b
    where e.created_at >= b.start_day::timestamptz
      and coalesce(e.user_agent, '') not like 'Werkzeug/%'
  ),
  dau_counts as (
    select day, count(distinct user_id) as n
    from events
    where user_id is not null
    group by 1
  ),
  event_counts as (
    select day,
      count(*) filter (where event_type = 'evidence_uploaded')     as evidence_uploads,
      count(*) filter (where event_type = 'registration_success')  as reg_success,
      count(*) filter (where event_type = 'registration_failed')   as reg_failed,
      count(*) filter (where event_type = 'login_success')         as login_success,
      count(*) filter (where event_type = 'login_failed')          as login_failed
    from events
    group by 1
  ),
  completion_counts as (
    select (c.completed_at at time zone 'utc')::date as day, count(*) as n
    from quest_task_completions c, bounds b
    where c.completed_at >= b.start_day::timestamptz
    group by 1
  ),
  start_counts as (
    select (q.started_at at time zone 'utc')::date as day, count(*) as n
    from user_quests q, bounds b
    where q.started_at >= b.start_day::timestamptz
    group by 1
  ),
  sis_cents as (
    select (p.recorded_at at time zone 'utc')::date as day, sum(p.amount_cents) as n
    from sis_payment_records p, bounds b
    where p.recorded_at >= b.start_day::timestamptz
    group by 1
  ),
  comment_counts as (
    select (c.created_at at time zone 'utc')::date as day,
      count(*) filter (where u.role = 'superadmin'
                          or lower(coalesce(u.email, '')) = any(coalesce(p_platform_emails, '{}')))
        as platform,
      count(*) filter (where not (u.role = 'superadmin'
                          or lower(coalesce(u.email, '')) = any(coalesce(p_platform_emails, '{}'))))
        as community
    from observer_comments c
    join users u on u.id = c.observer_id, bounds b
    where c.created_at >= b.start_day::timestamptz
    group by 1
  )
  select
    d.day,
    coalesce(s.n, 0)                  as signups,
    coalesce(a.n, 0)                  as dau,
    coalesce(c.n, 0)                  as task_completions,
    coalesce(st.n, 0)                 as quest_starts,
    coalesce(ec.evidence_uploads, 0)  as evidence_uploads,
    coalesce(ec.reg_success, 0)       as reg_success,
    coalesce(ec.reg_failed, 0)        as reg_failed,
    coalesce(ec.login_success, 0)     as login_success,
    coalesce(ec.login_failed, 0)      as login_failed,
    coalesce(sp.n, 0)                 as sis_payment_cents,
    coalesce(cc.platform, 0)          as comments_platform,
    coalesce(cc.community, 0)         as comments_community
  from days d
  left join signup_counts s      on s.day = d.day
  left join dau_counts a         on a.day = d.day
  left join completion_counts c  on c.day = d.day
  left join start_counts st      on st.day = d.day
  left join event_counts ec      on ec.day = d.day
  left join sis_cents sp         on sp.day = d.day
  left join comment_counts cc    on cc.day = d.day
  order by d.day
$$;

-- Superadmin-only data, reached exclusively through the backend's service-role
-- client. The Data API must not expose it to browser clients.
revoke all on function public.admin_platform_metrics_daily(integer, text[]) from public;
revoke all on function public.admin_platform_metrics_daily(integer, text[]) from anon;
revoke all on function public.admin_platform_metrics_daily(integer, text[]) from authenticated;
grant execute on function public.admin_platform_metrics_daily(integer, text[]) to service_role;
