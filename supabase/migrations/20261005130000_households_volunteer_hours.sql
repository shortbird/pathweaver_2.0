-- Volunteer hours, one number per family (iCreate ticket 01082b30).
--
-- "Could we make a way for parents to be able to see how many volunteer hours
-- they have completed? We can keep it updated, but ... keep it private so not
-- everyone sees everyone elses."
--
-- Staff write it through PATCH /api/sis/households/<id>; a family's own
-- guardians read it through GET /api/sis/parent/volunteer-hours. The family
-- directory names its columns and never selects these.
--
-- Additive only. New columns inherit the table's existing grants and RLS.

alter table public.households
  add column if not exists volunteer_hours numeric(6,2) not null default 0;

alter table public.households
  add column if not exists volunteer_hours_updated_at timestamptz;

alter table public.households
  drop constraint if exists households_volunteer_hours_range;

alter table public.households
  add constraint households_volunteer_hours_range
  check (volunteer_hours >= 0 and volunteer_hours <= 9999);
