-- =============================================================================
-- Tighten RLS on user_subject_xp and feed_item_views  (SEC-DB-1 / DB-H2)
-- =============================================================================
-- Audit finding (2026-07-21): on live prod, both tables carried a
-- `SELECT USING (true)` policy for the `public` role while anon + authenticated
-- held table SELECT grants. Result: ANY caller with the public anon key could
-- read every user's subject XP (user_id / school_subject / xp_amount /
-- pending_xp) and every user's per-item feed views (viewer_id / completion_id /
-- learning_event_id). Those permissive policies existed in NO committed
-- migration (applied out-of-band), so their exact names are unknown here.
--
-- This migration deterministically drops EVERY existing policy on the two
-- tables (regardless of name) and recreates owner-scoped policies:
--   * authenticated users may read ONLY their own rows
--   * the service_role (backend admin client) retains full access
-- anon has no auth.uid(), so anon reads now return zero rows.
--
-- The backend accesses both tables via the service-role admin client, so the
-- service_role catch-all preserves all existing server behavior.
-- =============================================================================

-- ── user_subject_xp (owner column: user_id) ─────────────────────────────────
DO $$
DECLARE pol record;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'user_subject_xp'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.user_subject_xp', pol.policyname);
  END LOOP;
END $$;

ALTER TABLE public.user_subject_xp ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own subject xp" ON public.user_subject_xp
  FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));

CREATE POLICY "Service role manages subject xp" ON public.user_subject_xp
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ── feed_item_views (owner column: viewer_id) ───────────────────────────────
DO $$
DECLARE pol record;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'feed_item_views'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.feed_item_views', pol.policyname);
  END LOOP;
END $$;

ALTER TABLE public.feed_item_views ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own feed views" ON public.feed_item_views
  FOR SELECT TO authenticated
  USING (viewer_id = (select auth.uid()));

-- Preserve the pre-existing "users can insert own views" capability, but
-- correctly scoped: the old policy had no WITH CHECK, so it allowed inserting
-- rows under ANY viewer_id. (The backend itself writes via service_role.)
CREATE POLICY "Users insert own feed views" ON public.feed_item_views
  FOR INSERT TO authenticated
  WITH CHECK (viewer_id = (select auth.uid()));

CREATE POLICY "Service role manages feed views" ON public.feed_item_views
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- =============================================================================
-- VERIFICATION (run after applying):
--   SELECT tablename, policyname, cmd, roles::text, qual
--   FROM pg_policies
--   WHERE schemaname='public'
--     AND tablename IN ('user_subject_xp','feed_item_views')
--   ORDER BY tablename, policyname;
-- Expect exactly the four policies above; no `qual = true` for public/anon/
-- authenticated on either table.
-- =============================================================================
