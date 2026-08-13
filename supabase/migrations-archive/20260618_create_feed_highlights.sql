-- Feed highlight reel: a superadmin-curated subset of feed items used for
-- showing off Optio (demos, marketing). Each row pins one feed item — a task
-- completion or a learning moment — to the highlight reel. Uniqueness on
-- (target_type, target_id) makes the add/remove toggle idempotent.
--
-- All access goes through the Flask backend (admin client / service role); the
-- v2 mobile app does not query this table directly, so RLS is enabled with no
-- policies (anon/authenticated are denied; service_role bypasses RLS). The
-- 20260527_restore_default_data_api_grants migration handles the implicit
-- Data API grants for new public tables.

CREATE TABLE IF NOT EXISTS public.feed_highlights (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    target_type text NOT NULL CHECK (target_type IN ('task_completed', 'learning_moment')),
    target_id uuid NOT NULL,
    created_by_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (target_type, target_id)
);

CREATE INDEX IF NOT EXISTS feed_highlights_created_at_idx
    ON public.feed_highlights (created_at DESC);

ALTER TABLE public.feed_highlights ENABLE ROW LEVEL SECURITY;
