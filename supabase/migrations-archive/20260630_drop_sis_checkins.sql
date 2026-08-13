-- Remove the SIS daily check-in feature.
--
-- The parent/teacher "check the child in for the day" flow (CheckInPage, the parent
-- dashboard card, /api/sis/checkin/*) is removed. Attendance is teacher-recorded in
-- sis_attendance, and guardians report planned absences in student_planned_absences,
-- so the check-in table is no longer used.
--
-- sis_attendance_alerts is KEPT — the attendance sweep still uses it to dedupe
-- attendance-gap alerts.

DROP TABLE IF EXISTS sis_checkins;
