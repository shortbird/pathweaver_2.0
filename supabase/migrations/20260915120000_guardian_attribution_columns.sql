-- Who did it, when a guardian did it for the student.
--
-- A parent can now complete a task, add a task, or enroll a child on the
-- child's own account without switching into it (family scope, 2026-09-15).
-- Evidence blocks already record the uploader (uploaded_by_user_id /
-- uploaded_by_role) and journal moments the capturer (captured_by_user_id),
-- but the three rows a parent can now write for a child carried nothing:
-- a completion, a task, and an enrollment made by a parent were
-- indistinguishable from the student's own work. iCreate's teacher read
-- fifteen completions whose only evidence was "Marked complete by parent"
-- and asked for evidence to be required, because the data could not tell her
-- who had pressed the button.
--
-- NULL means the student themselves. No default on purpose: a default of
-- user_id would make every historical row claim a fact nobody recorded.
-- ON DELETE SET NULL: deleting the parent's account must not delete the
-- child's completion.

ALTER TABLE public.quest_task_completions
    ADD COLUMN IF NOT EXISTS completed_by_user_id uuid
        REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE public.user_quest_tasks
    ADD COLUMN IF NOT EXISTS created_by_user_id uuid
        REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE public.user_quests
    ADD COLUMN IF NOT EXISTS enrolled_by_user_id uuid
        REFERENCES public.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.quest_task_completions.completed_by_user_id IS
    'The guardian who marked this complete on the student''s behalf. NULL = the student themselves.';
COMMENT ON COLUMN public.user_quest_tasks.created_by_user_id IS
    'The guardian who added this task to the student''s quest. NULL = the student themselves.';
COMMENT ON COLUMN public.user_quests.enrolled_by_user_id IS
    'The guardian who enrolled the student in this quest. NULL = the student themselves.';
