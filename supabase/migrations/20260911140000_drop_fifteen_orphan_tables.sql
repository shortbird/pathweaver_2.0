-- Fifteen tables no code reads, dropped.
--
-- The September remediation plan listed "the 16 orphan Supabase tables that
-- still hold live rows" as a decision for the user, and no phase picked it up.
-- The post-phase audit recomputed the list on 2026-09-10 -- 242 tables in
-- public, cross-referenced against backend/ (minus tests and scripts), web/src,
-- mobile/, shared/, marketing/, the SQL functions, views, triggers, policies,
-- foreign keys and pg_cron -- and the decision on 2026-09-11 was: delete.
--
-- SIXTEEN BECAME FIFTEEN. docs_search_misses looked unreferenced because no
-- application code names it. It is written by routes/docs.py through
-- rpc('upsert_search_miss'), and the table name lives only inside that SQL
-- function. A grep for the table sees nothing; a grep of pg_proc.prosrc does.
-- It stays. The other two functions that name a table on this list --
-- cleanup_expired_lms_sessions and check_security_fixes -- have no caller in
-- any app, no rpc() naming them, and no pg_cron job (there are zero cron jobs
-- in this database), so they go with their tables.
--
-- EVERY ROW IS EXPORTED FIRST, outside the repository, to
--
--     ~/optio-orphan-tables-export-20260911.json
--
-- 944 rows across the fifteen, as one JSON object keyed by table name, taken
-- at 2026-09-11T14:04:33Z. That file is the only undo. It is outside the repo
-- on purpose: several tables carry user ids and one carries 718 rows of
-- per-student minor-status and consent flags, and a git repository keeps
-- things forever.
--
-- What each was, so nobody has to guess later:
--
--   portfolio_visibility_reset_20260801   718  The C2 incident's evidence table
--   portfolio_visibility_reset_20260802     2  (AUDIT.md, 2026-08-01): per-student
--                                              consent flags captured by the reset.
--                                              Shipped with RLS off and anon grants,
--                                              which is what C2 was ABOUT. RLS was
--                                              turned on the same day; the rows
--                                              have never been read since.
--   sis_schedule_submissions               87  Predecessor of the schedule builder.
--                                              Last write 2026-08-04.
--   class_discussion_posts                 84  The class discussion board. Replaced
--                                              by the student chat on 2026-08-31;
--                                              last write 2026-08-27.
--   email_templates                        15  A database copy of templates that
--                                              live as Jinja files under
--                                              backend/templates/email/. Nothing
--                                              renders from the table; two one-off
--                                              repair scripts under backend/scripts/
--                                              were its only readers.
--   promo_interest                         13  Marketing-site forms from a funnel
--   consultation_requests                  12  that no longer exists. marketing/
--                                              writes to neither.
--   automation_sequences                    4
--   tutor_tier_limits                       4  Static plan limits for a tier
--                                              system that was removed.
--   security_warnings_documentation         2  Help text nothing displays.
--   ai_seeds                                1
--   buddies                                 1  346 updates on one row, none since
--                                              2026-03.
--   lms_sessions                            1  An LTI session store the current
--                                              LTI code does not use (it has
--                                              lti_pending_launches and
--                                              lti_auth_codes).
--   curriculum_settings                     0
--   tutorial_verification_log               0
--
-- NOT CASCADE. Each DROP is plain, so if something this audit missed still
-- depends on one of these tables, the migration fails on that statement and
-- says which, rather than taking the dependent along. The guard block above
-- the drops asks the same question earlier and names the offender.
--
-- Idempotent: IF EXISTS throughout.

DO $$
DECLARE
  victim   text;
  victims  text[] := ARRAY[
    'portfolio_visibility_reset_20260801', 'portfolio_visibility_reset_20260802',
    'sis_schedule_submissions', 'class_discussion_posts', 'email_templates',
    'promo_interest', 'consultation_requests', 'automation_sequences',
    'tutor_tier_limits', 'security_warnings_documentation', 'ai_seeds',
    'buddies', 'lms_sessions', 'curriculum_settings', 'tutorial_verification_log'
  ];
  offender text;
BEGIN
  FOREACH victim IN ARRAY victims LOOP
    IF to_regclass('public.' || victim) IS NULL THEN
      CONTINUE;  -- already gone; a re-run is a no-op
    END IF;

    -- A foreign key from a table OUTSIDE this set. The only FK into any of
    -- these is class_discussion_posts.parent_post_id, pointing at itself.
    SELECT c.conrelid::regclass::text INTO offender
      FROM pg_constraint c
     WHERE c.contype = 'f'
       AND c.confrelid = ('public.' || victim)::regclass
       AND c.conrelid::regclass::text <> ALL (
             SELECT 'public.' || v FROM unnest(victims) v
             UNION SELECT v FROM unnest(victims) v)
     LIMIT 1;
    IF offender IS NOT NULL THEN
      RAISE EXCEPTION 'refusing to drop %: % has a foreign key into it', victim, offender;
    END IF;

    -- A view. There are none, and a view that read a dropped table would
    -- fail every caller at once.
    SELECT v.viewname INTO offender
      FROM pg_views v
     WHERE v.schemaname = 'public'
       AND v.definition ILIKE '%' || victim || '%'
     LIMIT 1;
    IF offender IS NOT NULL THEN
      RAISE EXCEPTION 'refusing to drop %: view % reads it', victim, offender;
    END IF;
  END LOOP;
END $$;

-- The two dead functions first, so no function body names a table that no
-- longer exists. Both were checked for callers in every app and in pg_cron.
DROP FUNCTION IF EXISTS public.cleanup_expired_lms_sessions();
DROP FUNCTION IF EXISTS public.check_security_fixes();

DROP TABLE IF EXISTS public.portfolio_visibility_reset_20260801;
DROP TABLE IF EXISTS public.portfolio_visibility_reset_20260802;
DROP TABLE IF EXISTS public.sis_schedule_submissions;
DROP TABLE IF EXISTS public.class_discussion_posts;
DROP TABLE IF EXISTS public.email_templates;
DROP TABLE IF EXISTS public.promo_interest;
DROP TABLE IF EXISTS public.consultation_requests;
DROP TABLE IF EXISTS public.automation_sequences;
DROP TABLE IF EXISTS public.tutor_tier_limits;
DROP TABLE IF EXISTS public.security_warnings_documentation;
DROP TABLE IF EXISTS public.ai_seeds;
DROP TABLE IF EXISTS public.buddies;
DROP TABLE IF EXISTS public.lms_sessions;
DROP TABLE IF EXISTS public.curriculum_settings;
DROP TABLE IF EXISTS public.tutorial_verification_log;

-- ── Verification (run these after applying; all three must hold) ─────────────
--
--   -- 1. None of the fifteen remains.
--   SELECT count(*) FROM information_schema.tables
--    WHERE table_schema = 'public'
--      AND table_name IN ('portfolio_visibility_reset_20260801',
--        'portfolio_visibility_reset_20260802','sis_schedule_submissions',
--        'class_discussion_posts','email_templates','promo_interest',
--        'consultation_requests','automation_sequences','tutor_tier_limits',
--        'security_warnings_documentation','ai_seeds','buddies','lms_sessions',
--        'curriculum_settings','tutorial_verification_log');   -- expect 0
--
--   -- 2. The one that was nearly on the list is still here and still written.
--   SELECT count(*) FROM docs_search_misses;                    -- expect >= 1
--
--   -- 3. Nothing else lost a dependency: no function body names a table
--   --    that no longer exists. (Slow-ish; fine to run once.)
--   SELECT p.proname FROM pg_proc p
--     JOIN pg_namespace n ON n.oid = p.pronamespace
--    WHERE n.nspname = 'public' AND p.prokind = 'f'
--      AND (p.prosrc ILIKE '%lms_sessions%' OR p.prosrc ILIKE '%ai_seeds%'
--        OR p.prosrc ILIKE '%class_discussion_posts%');          -- expect 0 rows
--
-- Table count should read 227 (was 242).
