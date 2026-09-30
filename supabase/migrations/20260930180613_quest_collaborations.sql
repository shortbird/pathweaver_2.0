-- Who a student invited to collaborate on a quest.
--
-- Apogee Odessa, 2026-09-29: "how could a student share a project with another
-- student? I have one student that built a project and is working with a
-- partner, but we can't get that partner to have access to the same project."
--
-- A quest a student builds is private to them (quest_visibility_service:
-- personal quests open for the creator, the enrolled, and the adults around
-- them). The Friends Collaborate button sent the friend a notification linking
-- to the quest, and the friend got "Quest not found". A notification is not a
-- grant, so the invite is recorded here, and the visibility rule reads it: the
-- invited friend may open and start the quest while the inviter is still their
-- friend and still on it. Starting it copies the inviter's task list.
--
-- One row per (quest, inviter, invitee); a second invite refreshes invited_at.
-- Everything cascades: the grant means nothing without the quest or either
-- student, and an erased student's invites go with them.
--
-- RLS on, no policies: written and read through the service role by
-- backend/repositories/peer_connection_repository.py, behind the Friends
-- checks in services/peer_connection_service.collaborate. No per-table GRANT
-- (Data API grants are inherited).

CREATE TABLE IF NOT EXISTS public.quest_collaborations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    quest_id uuid NOT NULL REFERENCES public.quests(id) ON DELETE CASCADE,
    inviter_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    invitee_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    invited_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT quest_collaborations_distinct CHECK (inviter_id <> invitee_id),
    CONSTRAINT quest_collaborations_unique UNIQUE (quest_id, inviter_id, invitee_id)
);

CREATE INDEX IF NOT EXISTS quest_collaborations_invitee_quest_idx
    ON public.quest_collaborations (invitee_id, quest_id);
CREATE INDEX IF NOT EXISTS quest_collaborations_inviter_idx
    ON public.quest_collaborations (inviter_id);

ALTER TABLE public.quest_collaborations ENABLE ROW LEVEL SECURITY;
