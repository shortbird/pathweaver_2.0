-- The interest list: families who want a place in line BEFORE they register
-- or pay anything.
--
-- Apogee NoCo (Summer Hurd, 2026-10-16): "I want to create a waitlist for
-- 2027-28. I have a lot of pre-K families asking about kinder for next year.
-- I need a place to put them before they pay a registration fee."
--
-- Neither existing waitlist fits. sis_enrollment_waitlist (the age-group
-- waitlist) holds STUDENT accounts and is entered inside the registration
-- funnel after the fee; sis_waitlist_entries (the class waitlist) holds
-- enrolled students waiting on a seat. A family on this list has no account,
-- no household and no student rows yet -- only a parent's contact details
-- and their children's first names and birthdays, as typed.
--
-- Joined from "Join the waitlist" on the school's registration link
-- (POST /api/registration/interest-list, public and rate-limited), when the
-- school turns it on (feature_flags.registration.interest_list.enabled).
-- Worked by staff on SIS Registration > Enrollment queues > Interest list:
-- invite to register (emails the registration link), remove. A family who
-- later submits the funnel's family step with the same email is marked
-- registered automatically.
--
-- RLS on, no policies: children's names and birthdays from the public
-- internet, read and written only through the service role by
-- backend/services/sis_interest_list_service.py behind the route's role and
-- org checks. No per-table GRANT (Data API grants are inherited).

CREATE TABLE IF NOT EXISTS public.sis_interest_list_entries (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    parent_first_name text NOT NULL,
    parent_last_name text NOT NULL,
    -- Stored lower-cased: the registered match and the duplicate check compare it.
    email text NOT NULL,
    phone text,
    -- [{"first_name": "Ava", "dob": "2022-03-14"}, ...] as the family typed them.
    children jsonb NOT NULL DEFAULT '[]'::jsonb,
    -- What the family is interested in, in their words ("Kindergarten").
    interest text,
    -- The school's label when the family joined ("2027-28 school year"), so a
    -- list kept across years still says which year each family asked about.
    list_label text,
    notes text,
    status text NOT NULL DEFAULT 'waiting',
    invited_at timestamptz,
    invited_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
    registered_at timestamptz,
    removed_at timestamptz,
    removed_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT sis_interest_list_entries_status
        CHECK (status IN ('waiting', 'invited', 'registered', 'removed')),
    CONSTRAINT sis_interest_list_entries_children_array
        CHECK (jsonb_typeof(children) = 'array')
);

-- The staff list: one org, in the order families joined.
CREATE INDEX IF NOT EXISTS sis_interest_list_entries_org_idx
    ON public.sis_interest_list_entries (organization_id, created_at);

-- The registered match and the rejoin check: one org, one email.
CREATE INDEX IF NOT EXISTS sis_interest_list_entries_email_idx
    ON public.sis_interest_list_entries (organization_id, email);

ALTER TABLE public.sis_interest_list_entries ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.sis_interest_list_entries IS
  'Families who joined a school''s waitlist from its registration link before registering or paying. Service role only.';
