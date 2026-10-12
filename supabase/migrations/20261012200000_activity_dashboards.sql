-- Activity dashboards: who is using Optio, school by school.
--
-- The superadmin home had one platform-wide DAU line. It could say the
-- platform was busy; it could not say that Williamsburg had 47 members and
-- one of them had ever opened the app, or that The Treehouse had not
-- completed a task in a month. Every number below is grouped so that a row
-- names a school (or, on the SIS console, a class) somebody can call.
--
-- Three functions, all read-only and service-role only:
--
--   admin_org_activity(p_days)          one row per organization, plus one
--                                       row for platform users with no org
--   admin_platform_pipelines(p_days)    credit review, CRM and ticket queues
--                                       as one json object
--   sis_org_activity(p_org_id, p_days)  one school's activity: students and
--                                       families this window against the last,
--                                       per class, and the students gone quiet
--
-- "Active" is the same definition as the DAU chart: any user_activity_events
-- row in the window. "Quiet" is a student holding an unfinished, picked-up
-- quest whose last_active is older than 14 days -- the engagement sweep's
-- INACTIVITY_DAYS, but for every student, not only the ones in SIS classes.
--
-- Aggregation lives here for the same reason as admin_platform_metrics_daily:
-- user_activity_events grows with the platform, and counting rows in Python
-- truncates silently at PostgREST's 1,000-row cap.

create or replace function public.admin_org_activity(p_days integer default 30)
returns table (
  organization_id uuid,
  name text,
  members bigint,
  students bigint,
  active_users bigint,
  active_users_prev bigint,
  active_students bigint,
  tasks bigint,
  tasks_prev bigint,
  evidence bigint,
  messages bigint,
  quiet_students bigint,
  open_alerts bigint,
  last_seen timestamptz
)
language sql
stable
as $$
  with w as (
    select least(greatest(coalesce(p_days, 30), 1), 90) as d
  ),
  b as (
    select now() - make_interval(days => w.d) as cur,
           now() - make_interval(days => 2 * w.d) as prev
    from w
  ),
  people as (
    select u.id, u.organization_id, u.last_active,
           (u.role = 'student' or u.org_role = 'student') as is_student
    from users u
    where u.role <> 'superadmin'
  ),
  act as (
    select e.user_id,
           bool_or(e.created_at >= b.cur) as cur,
           bool_or(e.created_at <  b.cur) as prev,
           count(*) filter (where e.event_type = 'evidence_uploaded'
                              and e.created_at >= b.cur) as evidence
    from user_activity_events e, b
    where e.created_at >= b.prev and e.user_id is not null
    group by e.user_id
  ),
  tk as (
    select c.user_id,
           count(*) filter (where c.completed_at >= b.cur) as cur,
           count(*) filter (where c.completed_at <  b.cur) as prev
    from quest_task_completions c, b
    where c.completed_at >= b.prev
    group by c.user_id
  ),
  msg as (
    select m.sender_id as user_id, count(*) as n
    from (
      select sender_id, created_at from direct_messages
      union all
      select sender_id, created_at from group_messages
    ) m, b
    where m.created_at >= b.cur
    group by m.sender_id
  ),
  quiet as (
    select p.id
    from people p
    where p.is_student
      and (p.last_active is null or p.last_active < now() - interval '14 days')
      and exists (
        select 1 from user_quests q
        where q.user_id = p.id and q.status = 'picked_up'
          and q.completed_at is null and q.archived_at is null
      )
  ),
  alerts as (
    select x.organization_id, count(*) as n
    from (
      select a.organization_id from sis_attendance_alerts a where a.status = 'open'
      union all
      select g.organization_id from sis_engagement_alerts g
      where g.resolved_at is null and g.alert_type = 'inactive_two_weeks'
    ) x
    group by x.organization_id
  ),
  per as (
    select p.organization_id,
           count(*)                                        as members,
           count(*) filter (where p.is_student)            as students,
           count(*) filter (where a.cur)                   as active_users,
           count(*) filter (where a.prev)                  as active_users_prev,
           count(*) filter (where a.cur and p.is_student)  as active_students,
           coalesce(sum(t.cur), 0)::bigint                 as tasks,
           coalesce(sum(t.prev), 0)::bigint                as tasks_prev,
           coalesce(sum(a.evidence), 0)::bigint            as evidence,
           coalesce(sum(m.n), 0)::bigint                   as messages,
           count(q.id)                                     as quiet_students,
           max(p.last_active)                              as last_seen
    from people p
    left join act a   on a.user_id = p.id
    left join tk t    on t.user_id = p.id
    left join msg m   on m.user_id = p.id
    left join quiet q on q.id = p.id
    group by p.organization_id
  )
  select o.id, o.name::text,
         coalesce(per.members, 0), coalesce(per.students, 0),
         coalesce(per.active_users, 0), coalesce(per.active_users_prev, 0),
         coalesce(per.active_students, 0),
         coalesce(per.tasks, 0), coalesce(per.tasks_prev, 0),
         coalesce(per.evidence, 0), coalesce(per.messages, 0),
         coalesce(per.quiet_students, 0), coalesce(al.n, 0),
         per.last_seen
  from organizations o
  left join per    on per.organization_id = o.id
  left join alerts al on al.organization_id = o.id
  where o.archived_at is null
  union all
  select null::uuid, 'No organization',
         per.members, per.students, per.active_users, per.active_users_prev,
         per.active_students, per.tasks, per.tasks_prev, per.evidence,
         per.messages, per.quiet_students, 0::bigint, per.last_seen
  from per
  where per.organization_id is null
$$;


create or replace function public.admin_platform_pipelines(p_days integer default 30)
returns jsonb
language sql
stable
as $$
  with w as (
    select now() - make_interval(days => least(greatest(coalesce(p_days, 30), 1), 90)) as cur
  )
  select jsonb_build_object(
    'credit', (
      select jsonb_build_object(
        'requested', (select count(*) from quest_task_completions c, w
                      where c.credit_requested_at >= w.cur),
        'waiting_school', (select count(*) from quest_task_completions
                           where diploma_status = 'pending_org_approval'),
        'waiting_school_oldest', (select min(credit_requested_at) from quest_task_completions
                                  where diploma_status = 'pending_org_approval'),
        'waiting_optio', (select count(*) from quest_task_completions
                          where diploma_status = 'pending_review'),
        'waiting_optio_oldest', (select min(credit_requested_at) from quest_task_completions
                                 where diploma_status = 'pending_review'),
        'approved', (select count(*) from diploma_review_rounds r, w
                     where r.reviewer_action = 'approved' and r.reviewed_at >= w.cur),
        'sent_back', (select count(*) from diploma_review_rounds r, w
                      where r.reviewer_action = 'grow_this' and r.reviewed_at >= w.cur)
      )
    ),
    'crm', (
      select jsonb_build_object(
        'leads', (select count(*) from crm_leads l, w where l.created_at >= w.cur),
        'converted', (select count(*) from crm_leads l, w where l.converted_at >= w.cur),
        'in_funnels', (select count(*) from crm_funnel_memberships where status = 'active'),
        'delivered', (select count(*) from crm_email_events e, w
                      where e.event_type = 'delivered' and e.occurred_at >= w.cur),
        'opened', (select count(distinct e.send_id) from crm_email_events e, w
                   where e.event_type = 'open' and e.occurred_at >= w.cur),
        'clicked', (select count(distinct e.send_id) from crm_email_events e, w
                    where e.event_type = 'click' and e.occurred_at >= w.cur),
        'bounced', (select count(*) from crm_email_events e, w
                    where e.event_type in ('bounce', 'dropped', 'spamreport')
                      and e.occurred_at >= w.cur)
      )
    ),
    'tickets', (
      select jsonb_build_object(
        'open', count(*) filter (where status not in ('resolved', 'wont_fix')),
        'open_over_7d', count(*) filter (where status not in ('resolved', 'wont_fix')
                                           and created_at < now() - interval '7 days'),
        'oldest_open', min(created_at) filter (where status not in ('resolved', 'wont_fix')),
        'opened', count(*) filter (where created_at >= (select cur from w)),
        'resolved', count(*) filter (where resolved_at >= (select cur from w)),
        'median_hours_to_resolve', (
          select round((extract(epoch from percentile_cont(0.5) within group
                         (order by r.resolved_at - r.created_at)) / 3600)::numeric, 1)
          from bug_reports r, w
          where r.resolved_at >= w.cur and r.resolved_at > r.created_at
        )
      )
      from bug_reports
    )
  )
$$;


create or replace function public.sis_org_activity(p_org_id uuid, p_days integer default 7)
returns jsonb
language sql
stable
as $$
  with w as (
    select least(greatest(coalesce(p_days, 7), 1), 90) as d
  ),
  b as (
    select now() - make_interval(days => w.d) as cur,
           now() - make_interval(days => 2 * w.d) as prev
    from w
  ),
  people as (
    select u.id, u.first_name, u.last_name, u.display_name, u.last_active,
           (u.role = 'student' or u.org_role = 'student') as is_student,
           (u.role = 'parent'  or u.org_role = 'parent')  as is_parent
    from users u
    where u.organization_id = p_org_id
      -- The People page hides withdrawn and graduated students, and so does
      -- the census; this agrees with both (sis_service.INACTIVE_ENROLLMENT_STATUSES).
      and not exists (
        select 1 from school_enrollments se
        where se.organization_id = p_org_id and se.student_user_id = u.id
          and se.status in ('withdrawn', 'graduated')
      )
  ),
  act as (
    select e.user_id,
           bool_or(e.created_at >= b.cur) as cur,
           bool_or(e.created_at <  b.cur) as prev
    from user_activity_events e, b
    where e.created_at >= b.prev
      and e.user_id in (select id from people)
    group by e.user_id
  ),
  tk as (
    select c.user_id,
           count(*) filter (where c.completed_at >= b.cur) as cur,
           count(*) filter (where c.completed_at <  b.cur) as prev
    from quest_task_completions c, b
    where c.completed_at >= b.prev
      and c.user_id in (select id from people where is_student)
    group by c.user_id
  ),
  quiet as (
    select p.id, p.first_name, p.last_name, p.display_name, p.last_active,
           (select count(*) from user_quests q
            where q.user_id = p.id and q.status = 'picked_up'
              and q.completed_at is null and q.archived_at is null) as open_quests
    from people p
    where p.is_student
      and (p.last_active is null or p.last_active < now() - interval '14 days')
  ),
  quiet_open as (
    select * from quiet where open_quests > 0
  ),
  classes as (
    select oc.id, oc.name,
           count(ce.student_id)                       as students,
           count(ce.student_id) filter (where a.cur)  as active,
           coalesce(sum(t.cur), 0)                    as tasks
    from org_classes oc
    join class_enrollments ce on ce.class_id = oc.id and ce.status = 'active'
    join people p on p.id = ce.student_id
    left join act a on a.user_id = ce.student_id
    left join tk t  on t.user_id = ce.student_id
    where oc.organization_id = p_org_id and oc.status = 'active'
    group by oc.id, oc.name
  )
  select jsonb_build_object(
    'days', (select d from w),
    'students', (select count(*) from people where is_student),
    'active_students', (select count(*) from people p join act a on a.user_id = p.id
                        where p.is_student and a.cur),
    'active_students_prev', (select count(*) from people p join act a on a.user_id = p.id
                             where p.is_student and a.prev),
    'parents', (select count(*) from people where is_parent),
    'active_parents', (select count(*) from people p join act a on a.user_id = p.id
                       where p.is_parent and a.cur),
    'active_parents_prev', (select count(*) from people p join act a on a.user_id = p.id
                            where p.is_parent and a.prev),
    'tasks', (select coalesce(sum(cur), 0) from tk),
    'tasks_prev', (select coalesce(sum(prev), 0) from tk),
    'classes', coalesce((
      select jsonb_agg(jsonb_build_object(
               'class_id', c.id, 'name', c.name, 'students', c.students,
               'active', c.active, 'tasks', c.tasks)
             order by (c.active::numeric / nullif(c.students, 0)) asc nulls first, c.name)
      from classes c
    ), '[]'::jsonb),
    'quiet_total', (select count(*) from quiet_open),
    'quiet', coalesce((
      select jsonb_agg(jsonb_build_object(
               'user_id', q.id,
               'name', coalesce(nullif(trim(concat_ws(' ', q.first_name, q.last_name)), ''),
                                q.display_name),
               'last_active', q.last_active, 'open_quests', q.open_quests)
             order by q.last_active asc nulls first)
      from (select * from quiet_open order by last_active asc nulls first limit 25) q
    ), '[]'::jsonb)
  )
$$;


-- Reached only through the backend's service-role client: the superadmin
-- routes and the SIS dashboard, whose role and org gates are the authorization.
revoke all on function public.admin_org_activity(integer) from public, anon, authenticated;
revoke all on function public.admin_platform_pipelines(integer) from public, anon, authenticated;
revoke all on function public.sis_org_activity(uuid, integer) from public, anon, authenticated;
grant execute on function public.admin_org_activity(integer) to service_role;
grant execute on function public.admin_platform_pipelines(integer) to service_role;
grant execute on function public.sis_org_activity(uuid, integer) to service_role;
