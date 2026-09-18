-- The time clock and timesheets, removed.
--
-- sis_time_entries was the hourly teacher's punch clock (routes/sis/
-- staff_portal.py /time/*), the admin's timesheets and the payroll CSV
-- (routes/sis/staff_admin.py), all shipped with the teacher portal on
-- 2026-07-22. On 2026-09-18 the table held ZERO rows: no one had clocked in,
-- ever, at any school, and no staff profile had the clock switched on or an
-- hourly rate set. The one school that asked about pay (iCreate, tickets of
-- 2026-08-14 and 2026-08-25) wants it derived from class attendance -- an
-- hourly rate per scheduled class, a bonus hour per five taught, a training
-- rate -- not from a clock (docs/icreate/PRESENCE_AND_PAY_DISCUSSION_2026-08-18.md).
-- Tanner, 2026-09-18: "we won't use them, and they don't earn their space as
-- a feature." The code went in the same commit; this is the schema.
--
-- Nothing to export first: the table is empty (verified over the MCP the
-- same day). The pay columns on sis_staff_profiles (pay_type, payroll_id,
-- hourly_rate_cents) STAY: they are HR facts about the person, still shown
-- and edited on the staff record, and the attendance-based pay build would
-- read them. Only the clock's own switch goes.
--
-- ORDER MATTERS: run this only after the code that stops reading these is
-- deployed. The old backend selected uses_time_clock on every staff profile
-- write and read sis_time_entries on every teacher dashboard load; dropping
-- them under it would 500 both.

DROP TABLE IF EXISTS public.sis_time_entries;

ALTER TABLE public.sis_staff_profiles DROP COLUMN IF EXISTS uses_time_clock;
