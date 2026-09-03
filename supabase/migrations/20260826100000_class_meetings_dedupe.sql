-- A class that meets twice at the same time appears twice on every schedule.
--
-- iCreate, 2026-08-26: "This student's personal schedule shows her in Ukelele
-- twice but the class roster only has her in there once. I tried dropping her
-- and adding back in and it does the same thing." Dropping could not fix it:
-- the duplication was in class_meetings, not in the enrolment. The schedule
-- views render one block per meeting, so a class with two identical meeting
-- rows draws two blocks, while the roster -- which reads enrolments -- shows
-- the one seat that actually exists.
--
-- Ukelele Jam (Thurs Block 3) held two identical Thursday 11:30-12:30 rows.
-- add_meeting is a bare insert and the table had no uniqueness at all, so a
-- double submit or a re-run of the schedule builder silently doubled a class.

-- 1. Collapse existing duplicates, keeping the earliest row of each group so
--    any FK pointing at a meeting keeps pointing at a row that still exists.
WITH ranked AS (
    SELECT id,
           row_number() OVER (
               PARTITION BY class_id,
                            COALESCE(day_of_week, -1),
                            COALESCE(specific_date, DATE '0001-01-01'),
                            start_time
               ORDER BY created_at NULLS LAST, id
           ) AS rn
    FROM public.class_meetings
)
DELETE FROM public.class_meetings cm
USING ranked
WHERE cm.id = ranked.id
  AND ranked.rn > 1;

-- 2. Stop it recurring. A class cannot meet twice at the same start on the same
--    day; end_time is deliberately not part of the key, because two rows that
--    disagree only about when the class ends are still the same meeting entered
--    twice. COALESCE keeps the recurring (day_of_week) and one-off
--    (specific_date) shapes in one index without letting NULL defeat it.
CREATE UNIQUE INDEX IF NOT EXISTS class_meetings_no_duplicate_slot
    ON public.class_meetings (
        class_id,
        COALESCE(day_of_week, -1),
        COALESCE(specific_date, DATE '0001-01-01'),
        start_time
    );
