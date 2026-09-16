-- The safety screen reaches class chat.
--
-- 20260917100000 screened the two places a child's words reach another child
-- with no adult in between: peer comments and friend-to-friend messages. Class
-- student chats were left out on the argument that a teacher is in the group.
-- In the first week they carried 187 student messages against zero friend
-- messages, so the teacher-in-the-room argument was protecting the wrong
-- surface. Same contract as the other two: screened on the way in, fail OPEN
-- to 'pending' for the sweep, a refused text kept in peer_text_holds.
--
-- 1. screen_status / screened_at on group_messages, with the same partial
--    index on the pending backlog. NULL means an adult wrote it, or it
--    predates the screen.
--
-- 2. A hold can name a group instead of a recipient. recipient_id was NOT
--    NULL because a comment or a message always has one other child; a class
--    chat has a room. One of the two must be set.
--
-- 3. admin_peer_text_screen_stats(p_days): the superadmin home's tracker.
--    One call, aggregated in Postgres, because the count of screened rows
--    grows with the platform and a Python count truncates at 1,000 without
--    saying so. Cost comes from ai_usage_logs rows the screen service wrote.

ALTER TABLE public.group_messages
  ADD COLUMN IF NOT EXISTS screen_status text,
  ADD COLUMN IF NOT EXISTS screened_at timestamptz;
ALTER TABLE public.group_messages DROP CONSTRAINT IF EXISTS group_messages_screen_status_check;
ALTER TABLE public.group_messages ADD CONSTRAINT group_messages_screen_status_check
  CHECK (screen_status IS NULL OR screen_status IN ('pending', 'clear', 'flagged'));
CREATE INDEX IF NOT EXISTS idx_group_messages_screen_pending
  ON public.group_messages (created_at)
  WHERE screen_status = 'pending';

ALTER TABLE public.peer_text_holds ALTER COLUMN recipient_id DROP NOT NULL;
ALTER TABLE public.peer_text_holds
  ADD COLUMN IF NOT EXISTS group_id uuid REFERENCES public.group_conversations(id) ON DELETE SET NULL;
ALTER TABLE public.peer_text_holds DROP CONSTRAINT IF EXISTS peer_text_holds_surface_check;
ALTER TABLE public.peer_text_holds ADD CONSTRAINT peer_text_holds_surface_check
  CHECK (surface IN ('peer_comment', 'message', 'group_message'));
ALTER TABLE public.peer_text_holds DROP CONSTRAINT IF EXISTS peer_text_holds_target_check;
ALTER TABLE public.peer_text_holds ADD CONSTRAINT peer_text_holds_target_check
  CHECK (recipient_id IS NOT NULL OR group_id IS NOT NULL);

-- The tracker. Window counts are by created_at; the pending backlog is
-- all-time, because a row that has waited longer than the window is the one
-- worth seeing. Cost is whatever the screen service logged in the window.
create or replace function public.admin_peer_text_screen_stats(p_days integer default 7)
returns jsonb
language sql
security definer
set search_path = public
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
      count(*) filter (where h.stage = 'hidden_later') as hidden_later
    from public.peer_text_holds h, since
    where h.created_at >= since.t
    group by h.surface
  ),
  names as (
    select unnest(array['group_message', 'message', 'peer_comment']) as surface
  ),
  cost as (
    select count(*) as calls,
      coalesce(sum(input_tokens), 0) as input_tokens,
      coalesce(sum(output_tokens), 0) as output_tokens,
      coalesce(sum(estimated_cost), 0) as cost_usd,
      count(*) filter (where success is false) as failed_calls
    from public.ai_usage_logs, since
    where service_name = 'PeerTextScreenService' and created_at >= since.t
  )
  select jsonb_build_object(
    'days', greatest(coalesce(p_days, 7), 1),
    'surfaces', (
      select jsonb_object_agg(n.surface, jsonb_build_object(
        'screened', coalesce(b.screened, 0),
        'clear', coalesce(b.clear, 0),
        'flagged', coalesce(b.flagged, 0),
        'pending', coalesce(b.pending, 0),
        'refused', coalesce(h.refused, 0),
        'hidden_later', coalesce(h.hidden_later, 0)
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
    )
  );
$$;

revoke all on function public.admin_peer_text_screen_stats(integer) from public;
revoke all on function public.admin_peer_text_screen_stats(integer) from anon;
revoke all on function public.admin_peer_text_screen_stats(integer) from authenticated;
grant execute on function public.admin_peer_text_screen_stats(integer) to service_role;
