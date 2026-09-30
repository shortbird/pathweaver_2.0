-- quest_collaborations -> quest_collaboration_invites.
--
-- 20260930180613 reused the name of a table that was dropped on 2026-09-10
-- (an older collaboration feature; backend/tests/unit/
-- test_dropped_tables_are_not_queried.py still lists it so no code queries
-- it by accident). Two tables a month apart under one name is a trap for the
-- next reader, so the new one gets its own name before any code ships. The
-- table was empty when renamed, and nothing deployed read it.

ALTER TABLE IF EXISTS public.quest_collaborations RENAME TO quest_collaboration_invites;

ALTER TABLE IF EXISTS public.quest_collaboration_invites
    RENAME CONSTRAINT quest_collaborations_distinct TO quest_collaboration_invites_distinct;
ALTER TABLE IF EXISTS public.quest_collaboration_invites
    RENAME CONSTRAINT quest_collaborations_unique TO quest_collaboration_invites_unique;
ALTER TABLE IF EXISTS public.quest_collaboration_invites
    RENAME CONSTRAINT quest_collaborations_pkey TO quest_collaboration_invites_pkey;
ALTER TABLE IF EXISTS public.quest_collaboration_invites
    RENAME CONSTRAINT quest_collaborations_quest_id_fkey TO quest_collaboration_invites_quest_id_fkey;
ALTER TABLE IF EXISTS public.quest_collaboration_invites
    RENAME CONSTRAINT quest_collaborations_inviter_id_fkey TO quest_collaboration_invites_inviter_id_fkey;
ALTER TABLE IF EXISTS public.quest_collaboration_invites
    RENAME CONSTRAINT quest_collaborations_invitee_id_fkey TO quest_collaboration_invites_invitee_id_fkey;

ALTER INDEX IF EXISTS public.quest_collaborations_invitee_quest_idx
    RENAME TO quest_collaboration_invites_invitee_quest_idx;
ALTER INDEX IF EXISTS public.quest_collaborations_inviter_idx
    RENAME TO quest_collaboration_invites_inviter_idx;
