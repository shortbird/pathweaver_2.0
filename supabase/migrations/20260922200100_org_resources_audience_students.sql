-- A training link can be set for students.
--
-- iCreate, 2026-09-22 (ticket ae16c5da): "I would like to link to a video or
-- document option in the 'for families' (and students if it's not there
-- too)". A training link is an org_resources row flagged is_training
-- (20260918120000_training_links.sql), and org_resources.audience was
-- CHECK-constrained to families/staff/all -- there was no value a student
-- link could be stored as. The families half shipped without a migration;
-- this is the students half.
--
-- Apply BEFORE the code that writes 'students' deploys
-- (services/sis_training_service.resource_audience). Until then every
-- student link insert fails this constraint.
--
-- Nothing that reads the document library widens with it. Every library
-- reader asks for an explicit audience list (families/all for the family
-- portal, staff/all for staff) and none includes 'students'; the family
-- library also excludes is_training rows. Only the Training page and the
-- student list on /school read 'students'.

ALTER TABLE public.org_resources
    DROP CONSTRAINT IF EXISTS org_resources_audience_check;

ALTER TABLE public.org_resources
    ADD CONSTRAINT org_resources_audience_check
    CHECK (audience = ANY (ARRAY['families'::text, 'staff'::text, 'all'::text, 'students'::text]));
