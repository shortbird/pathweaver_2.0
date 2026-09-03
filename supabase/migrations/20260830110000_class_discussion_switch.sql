-- A per-class switch for the discussion board.
--
-- Every class quest page carries a threaded board that any enrolled student can
-- post on (routes/sis/class_discussions.py, 2026-07-24). Nothing could turn it
-- off, and until today no adult surface rendered it: the component was mounted
-- only on the student's quest page, so teachers and parents had no way to read
-- it. Gryffin's students found it on 2026-08-27 and wrote 80 posts in two days
-- while their teacher asked whether "teachers and parents see a group chat".
--
-- The teacher's class page now shows the board (with delete), a guardian reads
-- their own child's boards, and this column lets a teacher or admin switch a
-- class's board off. Off means students get a 403 (the component hides) and
-- nobody can post; moderators still see the history.

ALTER TABLE public.org_classes
  ADD COLUMN IF NOT EXISTS discussion_enabled boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.org_classes.discussion_enabled IS
  'Whether the class discussion board is open. False: students are refused '
  '(403, the board hides), nobody can post, teachers and admins can still '
  'read and delete the history. Toggled from the teacher class page '
  '(PATCH /api/sis/classes/<id>/discussion/settings).';
