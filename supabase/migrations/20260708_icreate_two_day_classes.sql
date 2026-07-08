-- iCreate SIS: convert single-day "either/or" program offerings into two-day classes.
-- Migration: 20260708_icreate_two_day_classes.sql
--
-- Context: several iCreate programs were seeded as one class record PER DAY (the
-- "enroll in either day or both, tuition is per day" model). The school confirmed
-- these programs actually meet TWO fixed days each week (attend both), so each
-- pair of single-day sections must collapse into ONE class that has two
-- class_meetings rows. Everything else (Exceptional Kids, Choir, etc.) stays
-- either/or and is left untouched.
--
-- Target two-day classes (org = iCreate, 1340004f-d12f-44ae-9ec3-185af5240130):
--   Kinder Nature School         -> two sections: Mon/Wed and Tue/Thu  ($1,800)
--   Elementary Microschool 5-7   -> Mon/Wed                             ($2,800)
--   Elementary Microschool 7-9   -> Mon/Wed                             ($2,800)
--   Elementary Microschool 9-11  -> Mon/Wed                             ($2,800)
--   Elementary Microschool 5-10  -> Tue/Thu                             ($2,800)
--   Middle School Microschool    -> Mon/Wed                             ($2,800)
--   High School Microschool      -> Mon/Wed                             ($2,800)
--   The Summit Program           -> Mon/Wed                             ($2,800)
--
-- Tuition doubles from the per-day figure to the full-year figure from the master
-- schedule, since one enrollment now covers both days.
--
-- Mechanics: for each pair, one record is the SURVIVOR (its existing meeting is
-- kept) and the other is the SIBLING (removed). Enrollments/waitlist on the
-- sibling move to the survivor (skipping students already enrolled there, so the
-- families that had signed up for both days collapse to one enrollment), the
-- survivor gains the second meeting day, is renamed to a two-day name, gets the
-- full-year price, and has the per-day/either-or note stripped from its
-- description. The migration is idempotent and safe to re-run.

-- 1. Move sibling enrollments onto the survivor (skip students already enrolled there).
UPDATE class_enrollments e
SET class_id = v.survivor
FROM (VALUES
 ('9bcdf4b9-08cb-4755-92bd-5c8b1dd1867e'::uuid,'d8f8bb25-7ac2-4656-8d1e-2b322b92c273'::uuid),
 ('acc3a163-5a2f-4334-8da1-b58e24e79db9'::uuid,'3bcc5b63-010a-44c1-8e47-4a0e0c514984'::uuid),
 ('9fee0d16-b60a-40f0-adb9-099cb526d665'::uuid,'49e9427b-97f1-478e-b8e9-d94f80958fc4'::uuid),
 ('aef2dd6d-0584-4db7-836a-8b106d3ee14a'::uuid,'99c011de-de78-4d72-a59b-361ba8f05f1f'::uuid),
 ('0c85af7c-50af-427d-9aac-1da1e0f68a8c'::uuid,'2d13617c-6dbe-4b28-ad69-6a6df3bf904c'::uuid),
 ('5dca39f9-0123-41d4-ac33-bf17bb7a789c'::uuid,'0aea0599-25bb-4473-a333-f2c703cc42b4'::uuid),
 ('b37f0c3b-4ba7-4cb8-91d7-4d6a027ce15c'::uuid,'37da5e40-436a-4432-9a9f-b0dbc4486a92'::uuid),
 ('cf89827b-780e-48c0-a068-8eea8e5d50ad'::uuid,'5a4b3d00-9b3e-4622-b66b-b07848367b2f'::uuid),
 ('a65e615d-6355-4a1c-afc5-d23f7f3b4ebd'::uuid,'32ff1f4a-b14e-4555-b564-4c220e597d7e'::uuid)
) AS v(survivor, sibling)
WHERE e.class_id = v.sibling
  AND NOT EXISTS (SELECT 1 FROM class_enrollments s WHERE s.class_id = v.survivor AND s.student_id = e.student_id);

-- 2. Move sibling waitlist entries similarly (defensive; empty at time of writing).
UPDATE sis_waitlist_entries w
SET class_id = v.survivor
FROM (VALUES
 ('9bcdf4b9-08cb-4755-92bd-5c8b1dd1867e'::uuid,'d8f8bb25-7ac2-4656-8d1e-2b322b92c273'::uuid),
 ('acc3a163-5a2f-4334-8da1-b58e24e79db9'::uuid,'3bcc5b63-010a-44c1-8e47-4a0e0c514984'::uuid),
 ('9fee0d16-b60a-40f0-adb9-099cb526d665'::uuid,'49e9427b-97f1-478e-b8e9-d94f80958fc4'::uuid),
 ('aef2dd6d-0584-4db7-836a-8b106d3ee14a'::uuid,'99c011de-de78-4d72-a59b-361ba8f05f1f'::uuid),
 ('0c85af7c-50af-427d-9aac-1da1e0f68a8c'::uuid,'2d13617c-6dbe-4b28-ad69-6a6df3bf904c'::uuid),
 ('5dca39f9-0123-41d4-ac33-bf17bb7a789c'::uuid,'0aea0599-25bb-4473-a333-f2c703cc42b4'::uuid),
 ('b37f0c3b-4ba7-4cb8-91d7-4d6a027ce15c'::uuid,'37da5e40-436a-4432-9a9f-b0dbc4486a92'::uuid),
 ('cf89827b-780e-48c0-a068-8eea8e5d50ad'::uuid,'5a4b3d00-9b3e-4622-b66b-b07848367b2f'::uuid),
 ('a65e615d-6355-4a1c-afc5-d23f7f3b4ebd'::uuid,'32ff1f4a-b14e-4555-b564-4c220e597d7e'::uuid)
) AS v(survivor, sibling)
WHERE w.class_id = v.sibling
  AND NOT EXISTS (SELECT 1 FROM sis_waitlist_entries s WHERE s.class_id = v.survivor AND s.student_user_id = w.student_user_id);

-- 3. Add the survivor's second meeting day (idempotent; copies the survivor's meeting location).
INSERT INTO class_meetings (class_id, organization_id, day_of_week, start_time, end_time, location)
SELECT v.survivor, '1340004f-d12f-44ae-9ec3-185af5240130'::uuid, v.add_day, v.start_t, v.end_t,
       (SELECT cm.location FROM class_meetings cm WHERE cm.class_id = v.survivor ORDER BY cm.day_of_week LIMIT 1)
FROM (VALUES
 ('9bcdf4b9-08cb-4755-92bd-5c8b1dd1867e'::uuid, 3, TIME '09:30', TIME '12:30'),  -- Kinder Mon/Wed  + Wed
 ('acc3a163-5a2f-4334-8da1-b58e24e79db9'::uuid, 4, TIME '09:30', TIME '12:30'),  -- Kinder Tue/Thu  + Thu
 ('9fee0d16-b60a-40f0-adb9-099cb526d665'::uuid, 3, TIME '09:30', TIME '15:00'),  -- Elem 5-7  + Wed
 ('aef2dd6d-0584-4db7-836a-8b106d3ee14a'::uuid, 3, TIME '09:30', TIME '15:00'),  -- Elem 7-9  + Wed
 ('0c85af7c-50af-427d-9aac-1da1e0f68a8c'::uuid, 3, TIME '09:30', TIME '15:00'),  -- Elem 9-11 + Wed
 ('5dca39f9-0123-41d4-ac33-bf17bb7a789c'::uuid, 4, TIME '09:30', TIME '15:00'),  -- Elem 5-10 + Thu
 ('b37f0c3b-4ba7-4cb8-91d7-4d6a027ce15c'::uuid, 3, TIME '09:30', TIME '15:00'),  -- Middle    + Wed
 ('cf89827b-780e-48c0-a068-8eea8e5d50ad'::uuid, 3, TIME '09:30', TIME '15:00'),  -- High      + Wed
 ('a65e615d-6355-4a1c-afc5-d23f7f3b4ebd'::uuid, 3, TIME '09:30', TIME '15:00')   -- Summit    + Wed
) AS v(survivor, add_day, start_t, end_t)
WHERE NOT EXISTS (SELECT 1 FROM class_meetings cm WHERE cm.class_id = v.survivor AND cm.day_of_week = v.add_day);

-- 4. Rename survivor to a two-day name, set full-year tuition, strip the per-day/either-or note.
UPDATE org_classes c
SET name = v.new_name,
    price_cents = v.price,
    description = regexp_replace(c.description, E'\n\nThis class is offered.*$', ''),
    updated_at = now()
FROM (VALUES
 ('9bcdf4b9-08cb-4755-92bd-5c8b1dd1867e'::uuid,'Kinder Nature School (Mon/Wed)',180000),
 ('acc3a163-5a2f-4334-8da1-b58e24e79db9'::uuid,'Kinder Nature School (Tue/Thu)',180000),
 ('9fee0d16-b60a-40f0-adb9-099cb526d665'::uuid,'Elementary Microschool (Mon/Wed)',280000),
 ('aef2dd6d-0584-4db7-836a-8b106d3ee14a'::uuid,'Elementary Microschool (Mon/Wed)',280000),
 ('0c85af7c-50af-427d-9aac-1da1e0f68a8c'::uuid,'Elementary Microschool (Mon/Wed)',280000),
 ('5dca39f9-0123-41d4-ac33-bf17bb7a789c'::uuid,'Elementary Microschool (Tue/Thu)',280000),
 ('b37f0c3b-4ba7-4cb8-91d7-4d6a027ce15c'::uuid,'Middle School Microschool (Mon/Wed)',280000),
 ('cf89827b-780e-48c0-a068-8eea8e5d50ad'::uuid,'High School Microschool (Mon/Wed)',280000),
 ('a65e615d-6355-4a1c-afc5-d23f7f3b4ebd'::uuid,'The Summit Program (Mon/Wed)',280000)
) AS v(survivor, new_name, price)
WHERE c.id = v.survivor;

-- 5. Remove the now-redundant sibling records (children first to satisfy FKs).
DELETE FROM class_enrollments e USING (VALUES
 ('d8f8bb25-7ac2-4656-8d1e-2b322b92c273'::uuid),('3bcc5b63-010a-44c1-8e47-4a0e0c514984'::uuid),
 ('49e9427b-97f1-478e-b8e9-d94f80958fc4'::uuid),('99c011de-de78-4d72-a59b-361ba8f05f1f'::uuid),
 ('2d13617c-6dbe-4b28-ad69-6a6df3bf904c'::uuid),('0aea0599-25bb-4473-a333-f2c703cc42b4'::uuid),
 ('37da5e40-436a-4432-9a9f-b0dbc4486a92'::uuid),('5a4b3d00-9b3e-4622-b66b-b07848367b2f'::uuid),
 ('32ff1f4a-b14e-4555-b564-4c220e597d7e'::uuid)
) AS s(sibling) WHERE e.class_id = s.sibling;

DELETE FROM sis_waitlist_entries w USING (VALUES
 ('d8f8bb25-7ac2-4656-8d1e-2b322b92c273'::uuid),('3bcc5b63-010a-44c1-8e47-4a0e0c514984'::uuid),
 ('49e9427b-97f1-478e-b8e9-d94f80958fc4'::uuid),('99c011de-de78-4d72-a59b-361ba8f05f1f'::uuid),
 ('2d13617c-6dbe-4b28-ad69-6a6df3bf904c'::uuid),('0aea0599-25bb-4473-a333-f2c703cc42b4'::uuid),
 ('37da5e40-436a-4432-9a9f-b0dbc4486a92'::uuid),('5a4b3d00-9b3e-4622-b66b-b07848367b2f'::uuid),
 ('32ff1f4a-b14e-4555-b564-4c220e597d7e'::uuid)
) AS s(sibling) WHERE w.class_id = s.sibling;

DELETE FROM class_meetings cm USING (VALUES
 ('d8f8bb25-7ac2-4656-8d1e-2b322b92c273'::uuid),('3bcc5b63-010a-44c1-8e47-4a0e0c514984'::uuid),
 ('49e9427b-97f1-478e-b8e9-d94f80958fc4'::uuid),('99c011de-de78-4d72-a59b-361ba8f05f1f'::uuid),
 ('2d13617c-6dbe-4b28-ad69-6a6df3bf904c'::uuid),('0aea0599-25bb-4473-a333-f2c703cc42b4'::uuid),
 ('37da5e40-436a-4432-9a9f-b0dbc4486a92'::uuid),('5a4b3d00-9b3e-4622-b66b-b07848367b2f'::uuid),
 ('32ff1f4a-b14e-4555-b564-4c220e597d7e'::uuid)
) AS s(sibling) WHERE cm.class_id = s.sibling;

DELETE FROM org_classes c USING (VALUES
 ('d8f8bb25-7ac2-4656-8d1e-2b322b92c273'::uuid),('3bcc5b63-010a-44c1-8e47-4a0e0c514984'::uuid),
 ('49e9427b-97f1-478e-b8e9-d94f80958fc4'::uuid),('99c011de-de78-4d72-a59b-361ba8f05f1f'::uuid),
 ('2d13617c-6dbe-4b28-ad69-6a6df3bf904c'::uuid),('0aea0599-25bb-4473-a333-f2c703cc42b4'::uuid),
 ('37da5e40-436a-4432-9a9f-b0dbc4486a92'::uuid),('5a4b3d00-9b3e-4622-b66b-b07848367b2f'::uuid),
 ('32ff1f4a-b14e-4555-b564-4c220e597d7e'::uuid)
) AS s(sibling) WHERE c.id = s.sibling;
