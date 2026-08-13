-- iCreate: revert the Elementary Microschool pods from two-day to per-day (either/or).
-- Migration: 20260709_icreate_elementary_per_day_pods.sql
--
-- Follow-up to 20260708_icreate_two_day_classes.sql. The school decided families
-- should be able to enroll in a SINGLE day of the elementary pods (Monday-only,
-- Wednesday-only, or both) rather than being forced into both days. Only the four
-- Elementary Microschool pods change; Kinder Nature School, the Middle/High School
-- Microschools, and The Summit Program remain two-day.
--
-- Each two-day elementary class is split back into two single-day classes at the
-- per-day price ($1,400 = 140000 cents; a family doing both days still pays the
-- $2,800 annual total). Families already enrolled in the two-day pod signed up for
-- both days, so their enrollment is copied onto the new second-day class to
-- preserve both-day attendance. Idempotent and safe to re-run.
--
-- org = iCreate (1340004f-d12f-44ae-9ec3-185af5240130).

-- A. Day-1 survivors become single-day classes: rename, per-day price, restore note.
UPDATE org_classes SET
  name = 'Elementary Microschool (Monday)', price_cents = 140000,
  description = description || E'\n\nThis class is offered Monday and Wednesday — enroll in either day or both. Tuition is per day.',
  updated_at = now()
WHERE id IN ('9fee0d16-b60a-40f0-adb9-099cb526d665',
             'aef2dd6d-0584-4db7-836a-8b106d3ee14a',
             '0c85af7c-50af-427d-9aac-1da1e0f68a8c')
  AND name = 'Elementary Microschool (Mon/Wed)';

UPDATE org_classes SET
  name = 'Elementary Microschool (Tuesday)', price_cents = 140000,
  description = description || E'\n\nThis class is offered Tuesday and Thursday — enroll in either day or both. Tuition is per day.',
  updated_at = now()
WHERE id = '5dca39f9-0123-41d4-ac33-bf17bb7a789c'
  AND name = 'Elementary Microschool (Tue/Thu)';

-- B. Remove the second-day meetings that the two-day merge added.
DELETE FROM class_meetings WHERE id IN (
  '368f8e50-cd7a-43d3-a3a3-bdded95a1584',  -- Wed on 5-7
  'a8466689-def4-4002-8ccd-bc4fc8efcc93',  -- Wed on 7-9
  '33ba011a-bc50-4397-9588-f1ba7cf7103f',  -- Wed on 9-11
  'd108547a-e1ea-4965-9136-dfb407f886f4'   -- Thu on 5-10
);

-- C. Recreate the day-2 classes as twins of the day-1 survivors (idempotent).
INSERT INTO org_classes
  (organization_id, created_by, name, description, min_age, max_age, capacity,
   price_cents, supply_fee, primary_instructor_id, location, xp_threshold,
   status, registration_status, waitlist_enabled)
SELECT organization_id, created_by, 'Elementary Microschool (Wednesday)', description,
       min_age, max_age, capacity, price_cents, supply_fee, primary_instructor_id,
       location, xp_threshold, 'active', 'open', waitlist_enabled
FROM org_classes s
WHERE s.name = 'Elementary Microschool (Monday)'
  AND s.organization_id = '1340004f-d12f-44ae-9ec3-185af5240130'
  AND NOT EXISTS (
    SELECT 1 FROM org_classes w
    WHERE w.organization_id = s.organization_id
      AND w.name = 'Elementary Microschool (Wednesday)'
      AND w.min_age = s.min_age AND COALESCE(w.max_age,-1) = COALESCE(s.max_age,-1));

INSERT INTO org_classes
  (organization_id, created_by, name, description, min_age, max_age, capacity,
   price_cents, supply_fee, primary_instructor_id, location, xp_threshold,
   status, registration_status, waitlist_enabled)
SELECT organization_id, created_by, 'Elementary Microschool (Thursday)', description,
       min_age, max_age, capacity, price_cents, supply_fee, primary_instructor_id,
       location, xp_threshold, 'active', 'open', waitlist_enabled
FROM org_classes s
WHERE s.name = 'Elementary Microschool (Tuesday)'
  AND s.organization_id = '1340004f-d12f-44ae-9ec3-185af5240130'
  AND NOT EXISTS (
    SELECT 1 FROM org_classes t
    WHERE t.organization_id = s.organization_id
      AND t.name = 'Elementary Microschool (Thursday)'
      AND t.min_age = s.min_age AND COALESCE(t.max_age,-1) = COALESCE(s.max_age,-1));

-- D. Give each new day-2 class its meeting (idempotent).
INSERT INTO class_meetings (class_id, organization_id, day_of_week, start_time, end_time, location)
SELECT w.id, w.organization_id, 3, TIME '09:30', TIME '15:00', w.location
FROM org_classes w
WHERE w.name = 'Elementary Microschool (Wednesday)'
  AND w.organization_id = '1340004f-d12f-44ae-9ec3-185af5240130'
  AND NOT EXISTS (SELECT 1 FROM class_meetings m WHERE m.class_id = w.id AND m.day_of_week = 3);

INSERT INTO class_meetings (class_id, organization_id, day_of_week, start_time, end_time, location)
SELECT t.id, t.organization_id, 4, TIME '09:30', TIME '15:00', t.location
FROM org_classes t
WHERE t.name = 'Elementary Microschool (Thursday)'
  AND t.organization_id = '1340004f-d12f-44ae-9ec3-185af5240130'
  AND NOT EXISTS (SELECT 1 FROM class_meetings m WHERE m.class_id = t.id AND m.day_of_week = 4);

-- E. Families enrolled in the (former two-day) pod keep BOTH days: copy each
--    Monday enrollment onto the matching Wednesday twin (idempotent).
INSERT INTO class_enrollments (class_id, student_id, status, enrolled_by, enrolled_at)
SELECT w.id, e.student_id, e.status, e.enrolled_by, e.enrolled_at
FROM class_enrollments e
JOIN org_classes mon ON mon.id = e.class_id
  AND mon.name = 'Elementary Microschool (Monday)'
  AND mon.organization_id = '1340004f-d12f-44ae-9ec3-185af5240130'
JOIN org_classes w ON w.organization_id = mon.organization_id
  AND w.name = 'Elementary Microschool (Wednesday)'
  AND w.min_age = mon.min_age AND COALESCE(w.max_age,-1) = COALESCE(mon.max_age,-1)
WHERE NOT EXISTS (
  SELECT 1 FROM class_enrollments e2 WHERE e2.class_id = w.id AND e2.student_id = e.student_id);
