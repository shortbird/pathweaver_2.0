-- Drop test_schema and backup_schema.
--
-- Two schemas that outlived the things they were for. Neither is referenced
-- anywhere in backend/, web/, mobile/ or scripts/ -- grepped, zero hits -- and
-- the application has no idea either exists.
--
-- WHAT IS IN THEM, MEASURED 2026-09-09 (not estimated -- counted)
--
-- test_schema: 14 tables, ALL EMPTY. Copies of users (41 columns), quests,
-- user_quests, quest_task_completions, user_quest_tasks, user_skill_xp, badges,
-- user_badges, friendships, login_attempts, parent_invitations,
-- parent_student_links, tutor_conversations, tutor_messages. Several of them
-- (friendships, parent_invitations) mirror tables the March 2026 audit dropped
-- from public, which dates this to an abandoned test harness from before that.
--
-- RLS is off on all 14. That matters not because anything reads them today --
-- nothing does -- but because a table shell with RLS off and a familiar name is
-- exactly the thing someone writes to by accident, having grepped for "users"
-- and found two.
--
-- backup_schema: 6 tables, 9 rows total.
--     subscription_tiers      4 rows  -- Explore/Accelerate/Achieve/Excel pricing
--     subscription_requests   3 rows  -- all still status='pending', from Oct 2025
--     quest_collaborations    2 rows  -- both 'accepted', from Sept 2025
--     subscription_history    0 rows
--     quest_ratings           0 rows
--     task_collaborations     0 rows
--
-- Every one of those six is a table CLAUDE.md lists under "Deleted Tables
-- (Don't Query)". The features were removed; the rows were not.
--
-- The nine rows were exported before this migration was written, to
--     ~/optio-backup_schema-export-20260909.sql
-- deliberately OUTSIDE the repository: five of the nine carry user UUIDs, and
-- "this person requested this subscription tier" is a fact about a real person
-- that does not belong in git history forever.
--
-- WHY CASCADE, AND WHY THE GUARD ABOVE IT
--
-- DROP SCHEMA without CASCADE only works on an empty schema, so CASCADE is not
-- optional here. But CASCADE is also how you silently drop a view in public that
-- happened to select from one of these tables -- it does the collateral damage
-- and reports success.
--
-- Verified 2026-09-09 that no such dependent exists: no foreign key crosses into
-- either schema, and neither contains a view, function or policy. The only
-- dependents are the schemas' own TOAST tables, which belong to the tables being
-- dropped.
--
-- That was true when this was written. The DO block re-checks it at APPLY time
-- and raises rather than proceeding, because the gap between writing a migration
-- in this repo and applying it has historically been weeks. It turns CASCADE's
-- quiet collateral damage into a loud failure.
--
-- REVERSING THIS
--
-- There is no down migration. Recreating 20 empty table shells serves nobody;
-- the definitions are in git history under supabase/migrations-archive/ if
-- anyone ever wants them, and the nine rows are in the export above.

DO $$
DECLARE
    offender text;
BEGIN
    SELECT string_agg(DISTINCT dn.nspname || '.' || dc.relname, ', ')
      INTO offender
    FROM pg_depend d
    JOIN pg_class rc ON rc.oid = d.refobjid
    JOIN pg_namespace rn ON rn.oid = rc.relnamespace
    JOIN pg_class dc ON dc.oid = d.objid
    JOIN pg_namespace dn ON dn.oid = dc.relnamespace
    WHERE rn.nspname IN ('test_schema', 'backup_schema')
      AND dn.nspname NOT IN ('test_schema', 'backup_schema', 'pg_toast');

    IF offender IS NOT NULL THEN
        RAISE EXCEPTION
          'Something outside these schemas now depends on them: %. '
          'CASCADE would drop it too. Investigate before re-running.', offender;
    END IF;
END $$;

DROP SCHEMA IF EXISTS test_schema CASCADE;
DROP SCHEMA IF EXISTS backup_schema CASCADE;
