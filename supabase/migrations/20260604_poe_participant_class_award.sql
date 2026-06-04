-- POE pilot: link each participant to their per-student Fine Arts credit-class
-- and track the attendance-based credit award.
--
-- Credit model (decided 2026-06-04): attending the POE earns 0.5 Fine Arts
-- credit. Each participant gets their own quest_type='class' quest ("Pipe Organ
-- Encounter"); on director-confirmed attendance we mark that class
-- credit_awarded AND deposit 1000 fine_arts subject XP (= 0.5 credit at
-- 2000 XP/credit) so it lands on the transcript. These columns let the
-- link/award admin steps find the right class quest and stay idempotent.

ALTER TABLE public.poe_participants
    ADD COLUMN IF NOT EXISTS class_quest_id        uuid REFERENCES public.quests(id),
    ADD COLUMN IF NOT EXISTS attendance_confirmed_at timestamptz,
    ADD COLUMN IF NOT EXISTS credit_awarded_at       timestamptz;

CREATE INDEX IF NOT EXISTS idx_poe_participants_class_quest_id
    ON public.poe_participants(class_quest_id);
