-- Safety depth, 2026-09-15: what the per-message screen could not see.
--
-- 1. A report may name a class chat message (the queue takes it down), and
--    may come from nobody: the nightly conversation review files reports
--    with reporter_id NULL against a whole thread ('conversation' for a DM
--    thread, 'group_conversation' for a class chat), reason 'safety_review'.
--
-- 2. A hold may be a picture a student uploaded on its own (surface
--    'upload'), with no recipient and no room. And a hold now records the
--    author's role, because an adult's held message goes to the adults who
--    supervise the adult, and the Holds tab should say "advisor".
--
-- 3. csam_incidents: one row per known-CSAM hash match on an upload
--    (services/upload_safety_service). RLS on, no policies: only the service
--    role writes it and only a superadmin route reads it. reported_at and
--    report_reference are written by the person who files the CyberTipline
--    report (docs/CHILD_SAFETY_REPORTING.md), so the row says whether the
--    legal duty was discharged.
--
-- 4. conversation_reviews: one row per thread per nightly read
--    (services/conversation_review_service), so a thread is not read twice
--    for the same messages and is not reported twice in a week.
--
-- 5. admin_peer_text_screen_stats grows the tracker: upload holds, holds on
--    adults' messages, hash matches, and what the nightly review found.

ALTER TABLE public.content_reports ALTER COLUMN reporter_id DROP NOT NULL;
ALTER TABLE public.content_reports DROP CONSTRAINT IF EXISTS content_reports_target_type_check;
ALTER TABLE public.content_reports ADD CONSTRAINT content_reports_target_type_check
  CHECK (target_type IN ('learning_event', 'task_completion', 'comment', 'user',
                         'peer_comment', 'message', 'group_message',
                         'conversation', 'group_conversation'));
ALTER TABLE public.content_reports DROP CONSTRAINT IF EXISTS content_reports_reason_check;
ALTER TABLE public.content_reports ADD CONSTRAINT content_reports_reason_check
  CHECK (reason IN ('spam', 'harassment', 'inappropriate', 'self_harm', 'other', 'safety_review'));

ALTER TABLE public.peer_text_holds
  ADD COLUMN IF NOT EXISTS author_role text;
ALTER TABLE public.peer_text_holds DROP CONSTRAINT IF EXISTS peer_text_holds_surface_check;
ALTER TABLE public.peer_text_holds ADD CONSTRAINT peer_text_holds_surface_check
  CHECK (surface IN ('peer_comment', 'message', 'group_message', 'upload'));
ALTER TABLE public.peer_text_holds DROP CONSTRAINT IF EXISTS peer_text_holds_target_check;
ALTER TABLE public.peer_text_holds ADD CONSTRAINT peer_text_holds_target_check
  CHECK (recipient_id IS NOT NULL OR group_id IS NOT NULL OR surface = 'upload');

CREATE TABLE IF NOT EXISTS public.csam_incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  purpose text NOT NULL,
  filename text,
  mime text,
  byte_size integer,
  sha256 text NOT NULL,
  provider text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  storage_path text,
  reported_at timestamptz,
  report_reference text,
  reported_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.csam_incidents ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_csam_incidents_created ON public.csam_incidents (created_at DESC);

CREATE TABLE IF NOT EXISTS public.conversation_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_kind text NOT NULL CHECK (thread_kind IN ('dm', 'group')),
  thread_id uuid NOT NULL,
  window_end timestamptz,
  message_count integer NOT NULL DEFAULT 0,
  verdict text NOT NULL CHECK (verdict IN ('clear', 'flagged')),
  risk text NOT NULL DEFAULT 'low' CHECK (risk IN ('low', 'medium', 'high')),
  reasons text[] NOT NULL DEFAULT '{}',
  model text,
  reported boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.conversation_reviews ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_conversation_reviews_thread
  ON public.conversation_reviews (thread_kind, thread_id, window_end DESC);
CREATE INDEX IF NOT EXISTS idx_conversation_reviews_created
  ON public.conversation_reviews (created_at DESC);

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
      count(*) filter (where h.stage = 'hidden_later') as hidden_later,
      count(*) filter (where h.author_role is not null and h.author_role <> 'student') as by_adults
    from public.peer_text_holds h, since
    where h.created_at >= since.t
    group by h.surface
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
    where service_name in ('PeerTextScreenService', 'ConversationReviewService')
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
        'screened', coalesce(b.screened, 0),
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
