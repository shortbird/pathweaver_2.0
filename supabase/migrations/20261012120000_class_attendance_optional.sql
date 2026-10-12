-- Ticket 29dff954 (iCreate, org admin): "Can we have some classes not require
-- attendance? Like this would be useful for our At Home days and independent
-- study."
--
-- The SIS class editor sets this ("Attendance not taken"). A class with it on
-- is left out of everything that chases a missing roll: the coordinator's
-- "Teachers to check", the Today's schedule "No roll yet", unaccounted-student
-- alerts, the daily attendance report, a student's "not taken" count, the
-- attendance rate and the roll-call report. A roll already taken stays stored.
-- Same shape as exclude_from_pay (20261002120000): a flag only.
ALTER TABLE public.org_classes
  ADD COLUMN IF NOT EXISTS attendance_optional boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.org_classes.attendance_optional IS
  'True for a class that takes no roll (at-home day, independent study). Staff-only; stripped from family payloads.';
