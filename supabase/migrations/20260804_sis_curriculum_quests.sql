-- A curriculum's saved quest set — the thing a class copies from each year.
--
-- iCreate, 2026-07-31: "I like the idea of quests in here, but I'm wondering if
-- we can add the ability to add an in-house course that is tied to the
-- curriculum. That way we don't have to start anew with the quests every year?
-- And maybe some teachers want to fill it in in advance."
--
-- The mismatch this fixes: `class_quests` hangs off org_classes, which is a
-- SECTION — this year's Tuesday 10:30 Reading Workshop. Next year's section is a
-- new row, so it starts empty and the teacher rebuilds the quest list from
-- nothing. `sis_curriculum` is the durable object (it already outlives the
-- timetable, and one curriculum already backs four sections), so the reusable
-- quest set belongs on it.
--
-- Deliberately a COPY, not a live view. A section's quests carry per-section
-- publish_at/due_date and get individually removed by the teacher; unioning the
-- curriculum's quests in at read time would either lose those or start silently
-- changing what enrolled students see when someone edits a curriculum
-- mid-semester. Copying keeps the section's list the section's own.

CREATE TABLE IF NOT EXISTS public.sis_curriculum_quests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  curriculum_id uuid NOT NULL REFERENCES public.sis_curriculum(id) ON DELETE CASCADE,
  quest_id uuid NOT NULL REFERENCES public.quests(id) ON DELETE CASCADE,
  sequence_order integer NOT NULL DEFAULT 0,
  added_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  added_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (curriculum_id, quest_id)
);

CREATE INDEX IF NOT EXISTS idx_sis_curriculum_quests_curriculum
  ON public.sis_curriculum_quests (curriculum_id, sequence_order);
CREATE INDEX IF NOT EXISTS idx_sis_curriculum_quests_quest
  ON public.sis_curriculum_quests (quest_id);

-- Staff-only, like sis_curriculum itself: reached exclusively through the
-- backend's admin client, never from a browser. RLS on with no policy is the
-- deny-all this table wants (see sis_curriculum's own posture).
ALTER TABLE public.sis_curriculum_quests ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.sis_curriculum_quests IS
  'Reusable quest set for a curriculum. Classes COPY from it (see '
  'POST /api/sis/classes/:id/quests/from-curriculum); it is not a live join.';
