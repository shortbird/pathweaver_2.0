-- Daily roll: whole-school attendance on the one attendance table.
--
-- Apogee Cache Valley, ticket 0680d03c: "schoolwide daily attendance for
-- teachers" -- Present on arrival in the morning, Absent with a reason,
-- Picked Up when they leave, with the pickup time recorded automatically.
-- Apogee does not use classes in Optio, so a class roll cannot answer it.
--
-- Extends sis_attendance rather than adding a second attendance table (the
-- tickets skill, 2b: a second attendance table is the bloat that rule exists
-- to stop). A row with class_id NULL is a whole-school daily-roll mark for
-- that student on that date. Every class row keeps its class_id, so the class
-- roll, its readers and its ~5k rows are unchanged.
--
-- The unique key becomes NULLS NOT DISTINCT so there is exactly one daily row
-- per student per date. It keeps the same columns and the same name, so
-- PostgREST's upsert on_conflict='class_id,student_user_id,date' (record() and
-- record_daily()) infers it exactly as before; a plain UNIQUE would let every
-- daily save insert a new NULL-class row. Postgres 15+ (prod is 17).
--
-- "Picked up" is departed_at set on a present or late row; arrived_at is
-- stamped the first time a student is marked present or late. The status
-- CHECK is unchanged (present/absent/late/excused). The absent reason is the
-- existing `note` column.

ALTER TABLE public.sis_attendance
  ALTER COLUMN class_id DROP NOT NULL;

ALTER TABLE public.sis_attendance
  DROP CONSTRAINT IF EXISTS sis_attendance_class_id_student_user_id_date_key;

ALTER TABLE public.sis_attendance
  ADD CONSTRAINT sis_attendance_class_id_student_user_id_date_key
  UNIQUE NULLS NOT DISTINCT (class_id, student_user_id, date);

ALTER TABLE public.sis_attendance
  ADD COLUMN IF NOT EXISTS arrived_at timestamptz,
  ADD COLUMN IF NOT EXISTS departed_at timestamptz,
  ADD COLUMN IF NOT EXISTS departed_by uuid REFERENCES public.users(id) ON DELETE SET NULL;

-- The daily roll reads one org's day: (organization_id, date) with class_id NULL.
CREATE INDEX IF NOT EXISTS idx_sis_attendance_daily
  ON public.sis_attendance (organization_id, date)
  WHERE class_id IS NULL;

COMMENT ON COLUMN public.sis_attendance.class_id IS
  'The class this roll mark is for. NULL = the whole-school daily roll (sis_settings.attendance.daily_roll).';
COMMENT ON COLUMN public.sis_attendance.arrived_at IS
  'When the student was first marked present or late on this row. Cleared when marked absent or excused.';
COMMENT ON COLUMN public.sis_attendance.departed_at IS
  'When the student was picked up (daily roll check-out). NULL = still here or not checked out.';
COMMENT ON COLUMN public.sis_attendance.departed_by IS
  'Who recorded the pickup.';
