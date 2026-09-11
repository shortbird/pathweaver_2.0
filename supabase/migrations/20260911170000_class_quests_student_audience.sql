-- Who a class quest is for.
--
-- A class_quests row has always meant "every active student in this section".
-- Gryffin, 2026-09-10 (Katie Bird): "Is there a way to go into a specific
-- student's assignments and remove them for a specific student? We have some
-- kids that can only handle so many assignments. On the flip side, is there a
-- way to only assign certain assignments to specific kids in each class?"
--
-- One column, one rule:
--   NULL      every active student in the class, now and as they join
--             (unchanged from today -- every existing row reads this way)
--   a list    only these students. A student who joins the class later does
--             NOT pick it up; the teacher adds them. That is the same rule
--             Google Classroom's "assign to specific students" follows, and
--             it is the safer default for a quest a teacher deliberately kept
--             off part of the class.
--
-- A column rather than a join table: the audience travels with the class link
-- (the curriculum round trip copies class_quests rows), it needs no new RLS
-- policy, and every reader that already selects publish_at now selects one more
-- field. Ids are not FK-checked: a withdrawn or deleted student's id may linger
-- in a list and is harmless -- every reader intersects the list with the
-- class's ACTIVE enrollments before it does anything.

ALTER TABLE public.class_quests
  ADD COLUMN IF NOT EXISTS student_ids uuid[];

COMMENT ON COLUMN public.class_quests.student_ids IS
  'Who this class quest is assigned to. NULL = every active student in the class (default). A list = only those students; students who join the class later are not added automatically. Always intersect with active class_enrollments before use.';
