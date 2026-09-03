-- Daily platform metrics for the superadmin home charts.
--
-- One RPC feeds every time-series chart on SuperadminHome (DAU, signups,
-- learning activity, auth funnel, SIS revenue) in a single round trip.
-- Aggregation happens here rather than in Python because user_activity_events
-- grows with the platform: fetching rows to tally them would either truncate
-- at PostgREST's 1000-row cap or page through tens of thousands of rows per
-- dashboard load (see CLAUDE.md "Row Limits").
--
-- Days are UTC calendar days, matching the AI cost chart's convention.
-- Werkzeug user agents are excluded: Flask's test client wrote 138 fake
-- registration_failed events into prod analytics on 2026-08-15, and the
-- historical rows remain even though the tracker now refuses them.

create or replace function public.admin_platform_metrics_daily(p_days integer default 30)
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
  sis_payment_cents bigint
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
    coalesce(sp.n, 0)                 as sis_payment_cents
  from days d
  left join signup_counts s      on s.day = d.day
  left join dau_counts a         on a.day = d.day
  left join completion_counts c  on c.day = d.day
  left join start_counts st      on st.day = d.day
  left join event_counts ec      on ec.day = d.day
  left join sis_cents sp         on sp.day = d.day
  order by d.day
$$;

-- Superadmin-only data, reached exclusively through the backend's service-role
-- client. The Data API must not expose it to browser clients.
revoke all on function public.admin_platform_metrics_daily(integer) from public;
revoke all on function public.admin_platform_metrics_daily(integer) from anon;
revoke all on function public.admin_platform_metrics_daily(integer) from authenticated;
grant execute on function public.admin_platform_metrics_daily(integer) to service_role;
