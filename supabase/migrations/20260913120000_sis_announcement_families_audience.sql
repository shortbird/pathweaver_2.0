-- "Families" on the announcement board, and the end of "Admins only".
--
-- The composer that could send to families without the staff was deleted on
-- 2026-09-10 (fd5f13e, "One announcement composer, not three"). That commit
-- listed sending to a narrowed audience among the four things going with it,
-- and the messaging composer offered in its place can only pick staff -- so
-- since then the weekly newsletter has notified every teacher in the school
-- with no way to say otherwise.
--
-- 'families' is that audience, expressed in the one vocabulary the board
-- already has: it means the parents.
--
-- 'admins' goes. On the board it did exactly what 'teachers' did -- the staff
-- announcements list is not filtered by audience, so every staff member read
-- both -- and it was the only value with no role to notify, which the composer
-- had to grey out a checkbox to explain. Neither production nor staging has
-- ever held a row using it, so the UPDATE below is a no-op on both and a safety
-- net anywhere else; a stored 'admins' is also read as 'teachers' in
-- sis_community_service._LEGACY_AUDIENCES.
--
-- sis_events keeps its own three-value audience, 'admins' included. It is a
-- different column on a different table and nothing here touches it.

UPDATE public.sis_announcements
   SET audience = 'teachers'
 WHERE audience = 'admins';

ALTER TABLE public.sis_announcements
    DROP CONSTRAINT IF EXISTS sis_announcements_audience_check;

ALTER TABLE public.sis_announcements
    ADD CONSTRAINT sis_announcements_audience_check
    CHECK (audience = ANY (ARRAY['school'::text, 'families'::text, 'teachers'::text]));
