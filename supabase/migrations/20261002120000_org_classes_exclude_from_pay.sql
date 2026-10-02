-- Ticket 2704bbd4 (iCreate, Molly): some classes exist only so a teacher has a
-- roster. The office needs to leave them out of what teachers are paid for.
-- The SIS class editor sets this ("Roster only - not paid"); the classes CSV
-- export shows it as a Paid column and skips these classes in the weekly
-- teaching hours format. A flag only: no pay rate lives on org_classes.
ALTER TABLE public.org_classes
  ADD COLUMN IF NOT EXISTS exclude_from_pay boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.org_classes.exclude_from_pay IS
  'True for a roster-only class that teachers are not paid for. Staff-only; stripped from family payloads.';
