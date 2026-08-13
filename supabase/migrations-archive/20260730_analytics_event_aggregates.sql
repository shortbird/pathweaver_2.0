-- Analytics aggregates for user_activity_events, computed in Postgres.
--
-- Why: the analytics service tallied these in Python over an unpaginated read of
-- user_activity_events (106k rows and growing). PostgREST caps a response at
-- db-max-rows (1000) and gives no signal that it did, so quest popularity was
-- computed from 1,000 of 3,169 events in the default 30-day window — roughly a
-- third of reality, and far worse over longer windows. See
-- docs/icreate/FAB_TRIAGE_2026-07-29_enrollment_counts.md.
--
-- Paging that read would mean ~107 sequential requests and pulling 106k jsonb
-- rows into the web process to compute a GROUP BY the database can do in one
-- pass. These functions return one row per group instead: bounded, exact, and
-- immune to the row cap because the result set is the aggregate, not the input.
--
-- SECURITY INVOKER (the default) is deliberate: RLS still applies to whoever
-- calls these. The analytics service uses the service-role client, which
-- bypasses RLS as it already did for the raw reads, so behaviour is unchanged.
-- search_path is pinned so the bodies cannot be captured by a shadowing schema.

-- Event counts grouped by category, over a date window, optionally for one user.
-- Replaces: select('event_category') + a Python Counter.
create or replace function public.analytics_event_counts_by_category(
    p_start   timestamptz,
    p_end     timestamptz,
    p_user_id uuid default null
)
returns table (event_category text, event_count bigint)
language sql
stable
set search_path = public, pg_temp
as $$
    select coalesce(e.event_category, 'other')::text as event_category,
           count(*)                                  as event_count
    from public.user_activity_events e
    where e.created_at >= p_start
      and e.created_at <= p_end
      and (p_user_id is null or e.user_id = p_user_id)
    group by 1
$$;

-- Per-quest view/start/completion counts since a cutoff.
-- Replaces: select('event_type, event_data') + a Python tally over every event.
-- One row per quest (602 today), so the result cannot approach the row cap even
-- as the event table keeps growing. Scoring and the top-N cut stay in the
-- service, so the endpoint's output shape is unchanged.
create or replace function public.analytics_quest_event_counts(
    p_since timestamptz
)
returns table (quest_id text, views bigint, starts bigint, completions bigint)
language sql
stable
set search_path = public, pg_temp
as $$
    select e.event_data->>'quest_id'                                    as quest_id,
           count(*) filter (where e.event_type = 'quest_viewed')        as views,
           count(*) filter (where e.event_type = 'quest_started')       as starts,
           count(*) filter (where e.event_type = 'quest_completed')     as completions
    from public.user_activity_events e
    where e.created_at >= p_since
      and e.event_type in ('quest_viewed', 'quest_started', 'quest_completed')
      and e.event_data ? 'quest_id'
      -- Only real quest ids. The activity tracker used to record the raw path
      -- segment after /quests/, so collection routes were logged as quest ids
      -- and "similar", "topics" and "completed" ranked as the most popular
      -- quests — 28% of the events in a 30-day window. The tracker now only
      -- records UUID-shaped segments, but the rows already written stay, so the
      -- aggregate filters them out too.
      and e.event_data->>'quest_id' ~
          '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    group by 1
$$;

grant execute on function public.analytics_event_counts_by_category(timestamptz, timestamptz, uuid)
    to authenticated, service_role;
grant execute on function public.analytics_quest_event_counts(timestamptz)
    to authenticated, service_role;

-- Supporting index: both functions filter on created_at, and the quest one also
-- filters event_type. Without this the aggregate is a full scan of the table.
create index if not exists idx_user_activity_events_created_at_event_type
    on public.user_activity_events (created_at, event_type);
