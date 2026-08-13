-- A curriculum's course set — the other half of "the curriculum is the container".
--
-- iCreate, 2026-07-25: "I wonder if we could access the accompanying optio
-- course here that we create to go along with some (all?) of the classes? We
-- are definitely going to need to have a way to create courses and connect them
-- to the classes." And, the same day: "if we connect courses, we need to have a
-- way for the teachers to edit those."
--
-- sis_curriculum_quests (20260804) made a curriculum carry its quests. This does
-- the same for courses, for the same reason: org_classes is a SECTION — this
-- year's Tuesday 10:30 Reading Workshop — so anything hung off it is rebuilt
-- from nothing next year. sis_curriculum is the durable object, so the reusable
-- set of teaching material belongs there and a section inherits it.
--
-- Unlike the quest set, this one IS a live link rather than a copy. A quest gets
-- per-section publish/due dates and is removed section by section, which is why
-- copying is right there. A course has no per-section state here — it is a
-- resource a teacher opens — so a live link means fixing a wrong attachment in
-- the library fixes it everywhere, instead of leaving stale copies on every
-- section that ever inherited it.

CREATE TABLE IF NOT EXISTS public.sis_curriculum_courses (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  curriculum_id   uuid NOT NULL REFERENCES public.sis_curriculum(id) ON DELETE CASCADE,
  course_id       uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  sequence_order  integer NOT NULL DEFAULT 0,
  added_by        uuid REFERENCES public.users(id) ON DELETE SET NULL,
  added_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (curriculum_id, course_id)
);

CREATE INDEX IF NOT EXISTS idx_sis_curriculum_courses_curriculum
  ON public.sis_curriculum_courses (curriculum_id, sequence_order);
CREATE INDEX IF NOT EXISTS idx_sis_curriculum_courses_course
  ON public.sis_curriculum_courses (course_id);

-- Staff-only, like sis_curriculum and sis_curriculum_quests: reached exclusively
-- through the backend's admin client, never from a browser. RLS on with no
-- policy is the deny-all this table wants.
ALTER TABLE public.sis_curriculum_courses ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.sis_curriculum_courses IS
  'Courses attached to a curriculum. A live link, not a copy (contrast '
  'sis_curriculum_quests): classes attached to the curriculum inherit these as '
  'teaching resources, so correcting the library corrects every class.';
