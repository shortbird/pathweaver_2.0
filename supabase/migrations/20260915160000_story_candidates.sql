-- Story candidates: a feed item bookmarked for a future story.
--
-- Stories (2026-09-11) start from the credit grader or from an id pasted
-- into the admin console. The superadmin sees most of the good work first in
-- the app's feed, on a phone, where neither of those is at hand. This is the
-- bookmark: one row per feed item (a task completion or a learning moment),
-- read back by the Stories page in the web app as the queue to review.
--
-- Shaped like feed_highlights (target_type + target_id) so the feed can
-- annotate items from both tables the same way, but a separate table: a
-- highlight is a public curation of the reel, a candidate is a private
-- note to self. `status` moves off `open` when a story is started from the
-- row (`started`, with story_id) or the idea is dropped (`dismissed`).
-- Flagging a dismissed item again reopens the same row.

CREATE TABLE IF NOT EXISTS public.story_candidates (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_type      text NOT NULL CHECK (target_type IN ('task_completed', 'learning_moment')),
  target_id        uuid NOT NULL,
  student_user_id  uuid REFERENCES public.users(id) ON DELETE CASCADE,
  note             text,
  status           text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'dismissed', 'started')),
  story_id         uuid REFERENCES public.stories(id) ON DELETE SET NULL,
  flagged_by       uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  resolved_at      timestamptz,
  UNIQUE (target_type, target_id)
);

COMMENT ON TABLE public.story_candidates IS
  'Feed items a superadmin bookmarked in the app for a future story. Read by the web Stories page. target_id is quest_task_completions.id or learning_events.id by target_type.';

CREATE INDEX IF NOT EXISTS story_candidates_open_idx
  ON public.story_candidates (created_at DESC) WHERE status = 'open';

DROP TRIGGER IF EXISTS trigger_story_candidates_updated_at ON public.story_candidates;
CREATE TRIGGER trigger_story_candidates_updated_at
  BEFORE UPDATE ON public.story_candidates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Superadmin-only data, reached through the service role like the rest of
-- the stories tables. No per-table GRANT: new tables inherit the Data API
-- grants (CLAUDE.md).
ALTER TABLE public.story_candidates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access to story candidates" ON public.story_candidates;
CREATE POLICY "Service role full access to story candidates"
  ON public.story_candidates FOR ALL TO public
  USING ((SELECT auth.role()) = 'service_role');
