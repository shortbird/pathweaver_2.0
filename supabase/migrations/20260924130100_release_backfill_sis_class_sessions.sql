-- Backfill sis_class_sessions from the attendance already taken (P7).
--
-- Run at release time, after 20260924130000_sis_class_sessions.sql. The new
-- code works without it (a class-day with no session reads as "no session
-- record", and the next save creates one); this gives the coordinator
-- dashboard and the history report the days before the release.
--
-- APPROXIMATE, and the rows say so only here: sis_attendance.recorded_by is
-- overwritten by every save, so for a class-day that was saved twice the
-- "first saver" below is really whoever last saved the student row that was
-- created first. taken_at is the first row's created_at, which is exact. For
-- the common case (one save per class-day) both are right.
--
-- Only the last 14 days are flagged. Checked 2026-09-23: this produces 420
-- sessions, 32 rolled by someone who is not an assigned teacher, 14 of them
-- inside the window. Flagging every past cover would open the coordinator's
-- "Teachers to check" list with a month of history nobody can act on; older
-- covers stay visible in the history report (taken_by is still recorded) with
-- sub_status 'none'.
--
-- Idempotent: a class-day that already has a session (written by the new
-- code between deploy and this run) is left alone.

WITH per_day AS (
  SELECT organization_id, class_id, date,
         min(created_at) AS taken_at,
         max(updated_at) AS last_saved_at,
         (array_agg(recorded_by ORDER BY created_at, updated_at)
            FILTER (WHERE recorded_by IS NOT NULL))[1] AS taken_by,
         (array_agg(recorded_by ORDER BY updated_at DESC)
            FILTER (WHERE recorded_by IS NOT NULL))[1] AS last_saved_by
  FROM public.sis_attendance
  GROUP BY organization_id, class_id, date
),
judged AS (
  SELECT d.*,
         (d.taken_by IS NOT NULL
          AND d.taken_by IS DISTINCT FROM oc.primary_instructor_id
          AND NOT (d.taken_by = ANY (coalesce(oc.assistant_instructor_ids, '{}')))
          AND NOT EXISTS (
            SELECT 1 FROM public.class_advisors ca
            WHERE ca.class_id = d.class_id AND ca.advisor_id = d.taken_by
              AND ca.is_active IS TRUE)) AS outsider,
         (SELECT m.id FROM public.class_meetings m
          WHERE m.class_id = d.class_id
            AND (m.specific_date = d.date
                 OR (m.specific_date IS NULL
                     AND m.day_of_week = extract(dow FROM d.date)::int))
          ORDER BY m.specific_date NULLS LAST, m.start_time
          LIMIT 1) AS meeting_id
  FROM per_day d
  JOIN public.org_classes oc ON oc.id = d.class_id
)
INSERT INTO public.sis_class_sessions
  (organization_id, class_id, date, meeting_id, taken_by, taken_at,
   last_saved_by, last_saved_at, substitute_id, sub_status)
SELECT j.organization_id, j.class_id, j.date, j.meeting_id, j.taken_by, j.taken_at,
       j.last_saved_by, j.last_saved_at,
       CASE WHEN j.outsider AND j.date >= current_date - 14 THEN j.taken_by END,
       CASE WHEN j.outsider AND j.date >= current_date - 14 THEN 'flagged' ELSE 'none' END
FROM judged j
WHERE NOT EXISTS (
  SELECT 1 FROM public.sis_class_sessions s
  WHERE s.class_id = j.class_id AND s.date = j.date)
ON CONFLICT ON CONSTRAINT sis_class_sessions_class_date_meeting_key DO NOTHING;
