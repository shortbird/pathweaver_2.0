-- Whether a class's teacher may change a quest's XP to finish.
--
-- quests.xp_threshold is the XP a student must earn before the quest counts as
-- finished. The office sets it in the library editor, and a class's teacher
-- could always move it from the class Quests tab. Molly (iCreate, 3d926fc3,
-- 2026-09-22): "I'd like to be able to add the required XP per quest. Then I
-- think it'd be good to click on 'teachers may change' if we want teachers to
-- change it."
--
-- Default true keeps every existing quest as it behaves today. When false,
-- PATCH /api/sis/classes/<id>/quests/<quest_id> refuses an xp_threshold change
-- from anyone who is not a school admin. Only the office's editors (library,
-- curriculum) write this column; the class /info route deliberately does not,
-- so a teacher cannot unlock themselves.
ALTER TABLE public.quests
  ADD COLUMN IF NOT EXISTS teachers_may_change_xp boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.quests.teachers_may_change_xp IS
  'Whether a class teacher may change xp_threshold from the class Quests tab. Set by school admins in the quest library editor. Admins may always change it.';
