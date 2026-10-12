-- Template tasks get a Definition of Done.
--
-- user_quest_tasks has had success_criteria (a jsonb list of one to five short
-- lines) for a while; the task a student holds shows it as a green-check
-- checklist and the reviewer checks the work against it. The quest a task is
-- copied from had nowhere to keep one, so a partner class (The Latticework,
-- 2026-09-30) wrote each task's checklist into the description under a
-- "Definition of done:" heading. A student enrolled straight from that quest
-- saw the checklist as plain text, and the quest editor could not edit it as
-- one. Enrollment copies this column onto each user_quest_tasks row.

ALTER TABLE public.quest_template_tasks
    ADD COLUMN IF NOT EXISTS success_criteria jsonb;

COMMENT ON COLUMN public.quest_template_tasks.success_criteria IS
    'Definition of Done: a JSON list of up to five short strings, copied onto user_quest_tasks.success_criteria at enrollment.';
