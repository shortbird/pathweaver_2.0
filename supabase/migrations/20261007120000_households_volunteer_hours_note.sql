-- Volunteer hours note, one short message per family beside the hours
-- (iCreate ticket b98a167f, following 01082b30).
--
-- "Can a note section be added just below that for the building manager cc
-- can add a little message with dates"
--
-- Same visibility as households.volunteer_hours: staff write it through
-- PATCH /api/sis/households/<id>; a family's own guardians read it through
-- GET /api/sis/parent/volunteer-hours. The family directory names its columns
-- and never selects it.
--
-- Additive only. New columns inherit the table's existing grants and RLS.

alter table public.households
  add column if not exists volunteer_hours_note text;

alter table public.households
  drop constraint if exists households_volunteer_hours_note_length;

alter table public.households
  add constraint households_volunteer_hours_note_length
  check (volunteer_hours_note is null or char_length(volunteer_hours_note) <= 1000);
