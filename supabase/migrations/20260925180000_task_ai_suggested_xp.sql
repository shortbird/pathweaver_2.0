-- What the AI thought a family-written task was worth, sized when the task was
-- created (services/task_sizing.py). The family's own number stays in xp_value;
-- this column exists so the credit reviewer can see "set at 200, AI sized it at
-- 75" and find inflated tasks without re-reading every one.
--
-- NULL = never sized: AI-generated and library tasks (their XP already came from
-- the AI), tasks a teacher wrote, and everything created before this column.

alter table public.user_quest_tasks
  add column if not exists ai_suggested_xp integer;

comment on column public.user_quest_tasks.ai_suggested_xp is
  'XP the AI suggested for a family- or student-written task at creation. NULL = not sized. xp_value stays the family''s claim; the credit reviewer compares the two.';

-- Optio Academy requires a Definition of Done on every task a family writes
-- (services/task_rules.py). The flag is per org so other schools keep today's
-- optional field.
update public.organizations
  set feature_flags = coalesce(feature_flags, '{}'::jsonb) || '{"require_success_criteria": true}'::jsonb
  where slug = 'optio-academy';
