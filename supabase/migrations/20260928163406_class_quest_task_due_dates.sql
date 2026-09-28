-- A due date on one task of a class quest, set by the class's teacher.
--
-- iCreate, ticket 26c91e25 (Karina): "it isn't possible to create a Quest like
-- 'Out of the Dust' and then have different due dates for each week's reading
-- assignment. Is there a way to have a running due date list of homework?"
-- class_quests.due_date dates the whole quest; this dates its steps.
--
-- One date per task PER CLASS, the same for every student in the class. It is
-- keyed on the TEMPLATE task (quest_template_tasks), not on a student's copy:
-- the copies are made at enrollment and rewritten by resync, while the template
-- id is stable across edits (sis_quest_authoring.replace_template_tasks). A
-- student's copy finds its date through user_quest_tasks.source_template_task_id.
-- Two classes that share a quest keep independent dates, hence class_id in the
-- key. Deleting the class, the quest or the task takes the date with it.
--
-- Additive only. Read and written through
-- backend/repositories/class_task_due_date_repository.py.
CREATE TABLE IF NOT EXISTS public.class_quest_task_due_dates (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    class_id uuid NOT NULL REFERENCES public.org_classes(id) ON DELETE CASCADE,
    quest_id uuid NOT NULL REFERENCES public.quests(id) ON DELETE CASCADE,
    template_task_id uuid NOT NULL REFERENCES public.quest_template_tasks(id) ON DELETE CASCADE,
    due_date timestamptz NOT NULL,
    -- Whoever set it. Their authorship trail only goes blank if they are erased.
    set_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT class_quest_task_due_dates_class_task_key UNIQUE (class_id, template_task_id)
);

CREATE INDEX IF NOT EXISTS class_quest_task_due_dates_class_quest_idx
    ON public.class_quest_task_due_dates (class_id, quest_id);

-- Service-role only: RLS on, no policies (the same posture as the other class
-- tables). Every reader and writer is a Flask route that authorizes first.
ALTER TABLE public.class_quest_task_due_dates ENABLE ROW LEVEL SECURITY;
