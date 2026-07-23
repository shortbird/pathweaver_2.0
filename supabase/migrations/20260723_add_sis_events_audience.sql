-- Calendar audiences: an event is visible to everyone (school), to staff
-- (teachers see school + teacher events), or to admins only. Families/students
-- only ever see 'school'. Default keeps every existing event school-wide.
ALTER TABLE public.sis_events
  ADD COLUMN IF NOT EXISTS audience text NOT NULL DEFAULT 'school';

ALTER TABLE public.sis_events
  DROP CONSTRAINT IF EXISTS sis_events_audience_check;
ALTER TABLE public.sis_events
  ADD CONSTRAINT sis_events_audience_check
  CHECK (audience IN ('school', 'teachers', 'admins'));

COMMENT ON COLUMN public.sis_events.audience IS
  'Who sees the event: school (everyone), teachers (staff only), admins (admins only). Families see only school.';
