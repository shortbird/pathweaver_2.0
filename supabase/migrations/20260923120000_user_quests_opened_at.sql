-- When a student (or their parent, in the family view) first and last opened
-- an assigned quest.
--
-- Assigning a quest to a class creates a user_quests row for every student at
-- once, so "has an enrollment" stopped meaning "has looked at it" the day class
-- assignment landed. A teacher had no way to tell a student who never opened
-- the quest from one who opened it and has not turned anything in yet
-- (iCreate, ticket 7cf5d330, 2026-09-23: "We'd want to see 'opened' 'assigned'
-- 'done' & engagement metric").
--
-- Written by GET /api/quests/<id> (routes/quest/detail.py) when the viewer is
-- the student or a parent in family scope -- never a teacher, platform staff or
-- a masquerading admin. first_opened_at is set once; last_opened_at moves at
-- most once an hour. Both are read by the SIS class Student Progress tab.
--
-- Nullable, no default: every existing enrollment reads as "not opened yet",
-- which is the honest answer -- nothing recorded opens before today. The code
-- tolerates this migration not being applied yet (both the write and the read
-- fall back when the columns are missing), so deploy order does not matter.
ALTER TABLE public.user_quests
  ADD COLUMN IF NOT EXISTS first_opened_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_opened_at timestamptz;

COMMENT ON COLUMN public.user_quests.first_opened_at IS
  'First time the student, or their parent in family scope, opened this quest. Set once by GET /api/quests/<id>. Teacher and staff views do not write it.';
COMMENT ON COLUMN public.user_quests.last_opened_at IS
  'Latest time the student, or their parent in family scope, opened this quest. Updated at most hourly by GET /api/quests/<id>.';
