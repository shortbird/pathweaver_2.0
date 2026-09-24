-- The safety screen tracker counts the uploads it cleared.
--
-- A clear upload leaves no row anywhere: only a hold does. So the tracker's
-- 'upload' surface showed screened == held ("17 screened, 17 held") however
-- many pictures the classifier had let through, and read as a screen that
-- held everything.
--
-- Since 2026-09-23 the upload classifier runs as its own class
-- (peer_text_screen_service.UploadScreenService), and ai_usage_logs names
-- the class on every call. One successful call is one upload judged. The
-- 'upload' surface's screened is those calls minus the refused holds, because
-- the card adds refused back on (SafetyScreenCard.surfaceTotals: screened =
-- rows + refused) and a hold is itself one of the calls. The upload calls
-- join the model cost too, which they were already part of under the old
-- class name.
--
-- Uploads before the deploy were logged as PeerTextScreenService, so the
-- window fills in from the deploy onward. Idempotent; replaces the function
-- from 20260918150000_safety_depth.sql with the same signature and grants.

create or replace function public.admin_peer_text_screen_stats(p_days integer default 7)
returns jsonb
language sql
security definer
set search_path to 'public'
as $$
  with since as (
    select now() - make_interval(days => greatest(coalesce(p_days, 7), 1)) as t
  ),
  surfaces as (
    select 'group_message' as surface, screen_status, created_at from public.group_messages
      where screen_status is not null
    union all
    select 'message', screen_status, created_at from public.direct_messages
      where screen_status is not null
    union all
    select 'peer_comment', screen_status, created_at from public.peer_comments
      where screen_status is not null
  ),
  by_surface as (
    select s.surface,
      count(*) filter (where s.created_at >= since.t) as screened,
      count(*) filter (where s.created_at >= since.t and s.screen_status = 'clear') as clear,
      count(*) filter (where s.created_at >= since.t and s.screen_status = 'flagged') as flagged,
      count(*) filter (where s.screen_status = 'pending') as pending
    from surfaces s, since
    group by s.surface
  ),
  holds as (
    select h.surface,
      count(*) filter (where h.stage = 'refused') as refused,
      count(*) filter (where h.stage = 'hidden_later') as hidden_later,
      count(*) filter (where h.author_role is not null and h.author_role <> 'student') as by_adults
    from public.peer_text_holds h, since
    where h.created_at >= since.t
    group by h.surface
  ),
  upload_calls as (
    select count(*) filter (where success is not false) as judged
    from public.ai_usage_logs, since
    where service_name = 'UploadScreenService'
      and created_at >= since.t
  ),
  names as (
    select unnest(array['group_message', 'message', 'peer_comment', 'upload']) as surface
  ),
  cost as (
    select count(*) as calls,
      coalesce(sum(input_tokens), 0) as input_tokens,
      coalesce(sum(output_tokens), 0) as output_tokens,
      coalesce(sum(estimated_cost), 0) as cost_usd,
      count(*) filter (where success is false) as failed_calls
    from public.ai_usage_logs, since
    where service_name in ('PeerTextScreenService', 'UploadScreenService', 'ConversationReviewService')
      and created_at >= since.t
  ),
  incidents as (
    select count(*) as total,
      count(*) filter (where reported_at is null) as unreported
    from public.csam_incidents, since
    where created_at >= since.t
  ),
  reviews as (
    select count(*) as reviewed,
      count(*) filter (where verdict = 'flagged' and reported) as flagged
    from public.conversation_reviews, since
    where created_at >= since.t
  )
  select jsonb_build_object(
    'days', greatest(coalesce(p_days, 7), 1),
    'surfaces', (
      select jsonb_object_agg(n.surface, jsonb_build_object(
        'screened', case when n.surface = 'upload'
                         then greatest((select judged from upload_calls) - coalesce(h.refused, 0), 0)
                         else coalesce(b.screened, 0) end,
        'clear', coalesce(b.clear, 0),
        'flagged', coalesce(b.flagged, 0),
        'pending', coalesce(b.pending, 0),
        'refused', coalesce(h.refused, 0),
        'hidden_later', coalesce(h.hidden_later, 0),
        'by_adults', coalesce(h.by_adults, 0)
      ))
      from names n
      left join by_surface b on b.surface = n.surface
      left join holds h on h.surface = n.surface
    ),
    'model', (
      select jsonb_build_object(
        'calls', c.calls,
        'failed_calls', c.failed_calls,
        'input_tokens', c.input_tokens,
        'output_tokens', c.output_tokens,
        'cost_usd', c.cost_usd
      ) from cost c
    ),
    'csam', (select jsonb_build_object('matches', i.total, 'unreported', i.unreported) from incidents i),
    'reviews', (select jsonb_build_object('reviewed', r.reviewed, 'flagged', r.flagged) from reviews r)
  );
$$;

revoke all on function public.admin_peer_text_screen_stats(integer) from public;
revoke all on function public.admin_peer_text_screen_stats(integer) from anon;
revoke all on function public.admin_peer_text_screen_stats(integer) from authenticated;
grant execute on function public.admin_peer_text_screen_stats(integer) to service_role;
