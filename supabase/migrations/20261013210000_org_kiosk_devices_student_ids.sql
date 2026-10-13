-- A classroom tablet can list a hand-picked set of students.
--
-- Apogee Cache Valley, 2026-10-13: their youngest students share one tablet
-- to photograph work, but the school does not use classes in Optio, and a
-- device could only be narrowed to one class. Without classes the tablet
-- listed every student in the school, Upper Studio teenagers included.
--
-- NULL (or an empty array) keeps the old behaviour: class_id if set, else the
-- whole school. When student_ids has entries, the name grid shows only those
-- students, and routes/kiosk.py clears class_id so only one scope is active.
-- A uuid[] rather than a junction table: one device lists a few dozen names
-- at most, it is read whole on every roster fetch, and the table is deny-all
-- RLS behind the service role, so nothing joins against it.

ALTER TABLE public.org_kiosk_devices
  ADD COLUMN IF NOT EXISTS student_ids uuid[];

COMMENT ON COLUMN public.org_kiosk_devices.student_ids IS
  'Students this device lists. NULL or empty = class_id scope, else whole school. Set from the settings card.';
