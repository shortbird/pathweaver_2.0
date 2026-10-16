-- Calendar events: RSVP by named child, a cap on spots, and repeating events.
--
-- Apogee NoCo (Summer Hurd), "SPARK Friday Excursions", two Fridays a month:
-- a list of the semester's excursions, a sign-up button per excursion, the
-- office sees who is coming each week, and a family can change its sign-up.
-- The RSVP that existed (9cf78e9a) counted heads per household; an excursion
-- needs to know WHICH children are coming, and a bus has a fixed number of
-- seats.
--
-- Extends the one RSVP table rather than adding a sign-up table beside it: the
-- reply is still one row per household per event, so the fee (billed once per
-- family), the Replies list and the headcount keep working unchanged.
--
--   sis_events.rsvp_mode      'count'    -- "how many of you" (the old reply)
--                             'children' -- "which of your children"
--   sis_events.rsvp_capacity  spots, NULL = no limit. Counts children in
--                             children mode, people in count mode -- in both
--                             modes that is sis_event_rsvps.party_size, which
--                             the service keeps equal to the number of children
--                             picked in children mode.
--   sis_events.series_id      shared by every occurrence of a repeating event.
--                             Each occurrence is its own row with its own RSVP
--                             list, so one Friday can be edited, cancelled or
--                             filled without touching the others.
--   sis_event_rsvps.student_ids  the children a household signed up.
--
-- Capacity is enforced HERE, not only in the service. The service checks first
-- so it can say something kind; two families pressing "Sign up" for the last
-- seat at the same moment both pass a check-then-insert, so the trigger locks
-- the event row (FOR UPDATE) and re-counts inside the transaction. A reply that
-- does not GROW (saying no, dropping a child, an edit at the same size) always
-- passes, even over the cap, so a family already in can always change down --
-- including after the office lowers the cap below what has been taken.

ALTER TABLE public.sis_events
  ADD COLUMN IF NOT EXISTS rsvp_mode text NOT NULL DEFAULT 'count',
  ADD COLUMN IF NOT EXISTS rsvp_capacity integer,
  ADD COLUMN IF NOT EXISTS series_id uuid;

ALTER TABLE public.sis_events
  DROP CONSTRAINT IF EXISTS sis_events_rsvp_mode_check;
ALTER TABLE public.sis_events
  ADD CONSTRAINT sis_events_rsvp_mode_check CHECK (rsvp_mode IN ('count', 'children'));

ALTER TABLE public.sis_events
  DROP CONSTRAINT IF EXISTS sis_events_rsvp_capacity_check;
ALTER TABLE public.sis_events
  ADD CONSTRAINT sis_events_rsvp_capacity_check CHECK (rsvp_capacity IS NULL OR rsvp_capacity > 0);

CREATE INDEX IF NOT EXISTS idx_sis_events_series
  ON public.sis_events (series_id, start_at)
  WHERE series_id IS NOT NULL;

ALTER TABLE public.sis_event_rsvps
  ADD COLUMN IF NOT EXISTS student_ids uuid[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.sis_events.rsvp_mode IS
  'How families reply: count = how many people; children = which of their children are coming.';
COMMENT ON COLUMN public.sis_events.rsvp_capacity IS
  'Spots available (children in children mode, people in count mode). NULL = no limit. Enforced by sis_event_rsvps_enforce_capacity.';
COMMENT ON COLUMN public.sis_events.series_id IS
  'Shared by every occurrence of a repeating event. NULL = a one-off event.';
COMMENT ON COLUMN public.sis_event_rsvps.student_ids IS
  'Children of this household signed up (rsvp_mode = children). party_size equals its length when attending.';

CREATE OR REPLACE FUNCTION public.sis_event_rsvps_enforce_capacity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  cap integer;
  taken integer;
  old_size integer := 0;
  new_size integer := 0;
BEGIN
  -- The lock is the point: every reply to this event queues behind it, so the
  -- count below cannot be stale by the time the row is written.
  SELECT rsvp_capacity INTO cap
    FROM public.sis_events WHERE id = NEW.event_id FOR UPDATE;
  IF cap IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.attending THEN new_size := COALESCE(NEW.party_size, 1); END IF;
  IF TG_OP = 'UPDATE' AND OLD.attending THEN old_size := COALESCE(OLD.party_size, 1); END IF;
  IF new_size <= old_size THEN
    RETURN NEW;  -- changing down (or not at all) is always allowed
  END IF;

  SELECT COALESCE(SUM(party_size), 0) INTO taken
    FROM public.sis_event_rsvps
   WHERE event_id = NEW.event_id AND attending AND id <> NEW.id;

  IF taken + new_size > cap THEN
    RAISE EXCEPTION 'event_full: % of % spots taken', taken, cap
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sis_event_rsvps_capacity ON public.sis_event_rsvps;
CREATE TRIGGER trg_sis_event_rsvps_capacity
  BEFORE INSERT OR UPDATE OF attending, party_size ON public.sis_event_rsvps
  FOR EACH ROW EXECUTE FUNCTION public.sis_event_rsvps_enforce_capacity();
