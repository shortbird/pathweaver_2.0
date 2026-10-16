-- "Included with" another class, so a bundled program does not double-bill.
--
-- Apogee NoCo's Hybrid Program ($4,950) includes SPARK Friday Excursions
-- ($1,450) and Life Skills ($2,950). Hybrid students are enrolled in all three
-- for rosters, the roll and the class chats, and To invoice billed all three.
-- Other families take SPARK or Life Skills alone and pay those prices.
--
-- A class lists the classes whose price already covers it. A student enrolled
-- in the class AND in any class on its list pays nothing for it: no tuition,
-- no supply fee (a $0 invoice line names what pays for it). The one rule is
-- sis_tuition_service.included_with; the SIS class editor sets the list, and
-- the route refuses another school's class, the class itself, and a loop.
--
-- An array, not a join table: same shape as assistant_instructor_ids and
-- additional_locations, read with the class row everywhere a class is priced.
-- No foreign key on array elements; a stale id (a deleted class) is ignored by
-- the rule, because nobody can be enrolled in it.
ALTER TABLE public.org_classes
  ADD COLUMN IF NOT EXISTS included_with_class_ids uuid[] NOT NULL DEFAULT '{}'::uuid[];

COMMENT ON COLUMN public.org_classes.included_with_class_ids IS
  'Classes whose price covers this one. A student enrolled in this class and in any of these pays no tuition or supply fee for this class.';
