-- Shout-outs can be replied to.
--
-- iCreate, 2026-08-31 (d0c7ac4e): "it would be nice to be able to add comments
-- to the shout-outs on Community page for the post recognition."
--
-- A shout-out is the one thing on the Community board that people want to pile
-- onto — somebody names a colleague, and the rest of the staff want to say "yes,
-- her too". Until now the board could only be added to by writing a second
-- shout-out, which buries the first.
--
-- Modelled on sis_form_comments, the queue's comment thread: one row per
-- comment, the author kept, and organization_id carried so every read is pinned
-- to a school without a join. Deny-all RLS like the rest of the Community Hub
-- tables (20260727_community_hub) — the backend reaches these with the service
-- role and does the authorization in Python.

CREATE TABLE IF NOT EXISTS public.sis_recognition_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recognition_id uuid NOT NULL
    REFERENCES public.sis_recognition(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL,
  author_id uuid,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- The only read there is: one shout-out's comments, oldest first (a thread is
-- read in the order it was written, unlike the board itself).
CREATE INDEX IF NOT EXISTS idx_sis_recognition_comments_thread
  ON public.sis_recognition_comments(recognition_id, created_at);

ALTER TABLE public.sis_recognition_comments ENABLE ROW LEVEL SECURITY;


-- A resource can be shared with named people, not only with roles.
--
-- iCreate, 2026-09-01 (cf671ff2): "Can we share a resource with just a specific
-- person so they can have that link they have pinned in their portal? For
-- example, it would be nice to share the spreadsheet where all the purchase
-- responses were recorded."
--
-- `visible_to_roles` answers "which KIND of staff", which is the wrong question
-- for a link that belongs to one person doing one job. The two narrow
-- independently and are ORed: a row naming Katrine and ticking "Coordinators"
-- reaches Katrine and every coordinator, which is what either control on its
-- own would lead somebody to expect.
--
-- NULL/empty means "not narrowed to anybody in particular", exactly as
-- visible_to_roles already does, so every existing row keeps its behaviour.
ALTER TABLE public.org_resources
  ADD COLUMN IF NOT EXISTS visible_to_user_ids uuid[];


-- A class can occupy more than one room.
--
-- iCreate, 2026-09-04 (43625a45): "Can we have a way to add more than one room
-- to a class? And a room conflict notice would be good."
--
-- `location` stays the primary room and is what every existing reader shows —
-- the roster sheet, the corridor print-out, the family schedule. This is the
-- rest of the space the class takes up, so the double-booking check knows the
-- pottery class is in the kiln shed as well as the art room, and stops handing
-- the shed to somebody else at the same hour.
--
-- NULL/empty means "one room", which is every class that exists today.
ALTER TABLE public.org_classes
  ADD COLUMN IF NOT EXISTS additional_locations text[];


-- An event can ask families to say they are coming, and to pay for it.
--
-- iCreate, 2026-08-28 (9cf78e9a): "The ability to add a form for collecting
-- RSVPs and payments to the calendar events would be good."
--
-- Two columns on the event and one row per reply. Deliberately NOT a form
-- template: an RSVP is always the same three questions (are you coming, how
-- many, anything we should know), and routing it through the general form
-- builder would put the replies in the staff request queue instead of on the
-- event they answer.
--
-- The fee is charged the way every other family charge is — a `sent` invoice
-- via sis_billing_service.create_charge — so it lands in the billing portal the
-- family already pays through, and the office reconciles it in one place.
ALTER TABLE public.sis_events
  ADD COLUMN IF NOT EXISTS rsvp_enabled boolean NOT NULL DEFAULT false,
  -- NULL means "no charge", which is not the same as zero: a zero would render
  -- a payment line for nothing.
  ADD COLUMN IF NOT EXISTS rsvp_fee_cents integer,
  ADD COLUMN IF NOT EXISTS rsvp_closes_at timestamptz;

CREATE TABLE IF NOT EXISTS public.sis_event_rsvps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.sis_events(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL,
  -- Who replied. One reply per household per event: an RSVP is a family
  -- answering, not each guardian answering separately.
  household_id uuid,
  responded_by uuid,
  attending boolean NOT NULL DEFAULT true,
  party_size integer NOT NULL DEFAULT 1,
  note text,
  -- The charge raised for this reply, when the event has a fee. Kept so a
  -- cancelled RSVP can be reconciled against what was billed rather than the
  -- office hunting for it.
  invoice_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- One reply per family per event; changing your mind updates the row.
CREATE UNIQUE INDEX IF NOT EXISTS uq_sis_event_rsvps_household
  ON public.sis_event_rsvps(event_id, household_id)
  WHERE household_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sis_event_rsvps_event
  ON public.sis_event_rsvps(event_id, created_at);

ALTER TABLE public.sis_event_rsvps ENABLE ROW LEVEL SECURITY;
