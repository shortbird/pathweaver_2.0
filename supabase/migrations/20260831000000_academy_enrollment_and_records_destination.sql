-- Credit Partner Program, phase 1: who is an Optio Academy student, and where
-- their records are supposed to go.
--
-- Background: an outside organization (a sports club, a music studio) enrolls
-- its participants in Optio Academy so their participation earns high school
-- credit. Two facts had nowhere structured to live, and the POE pilot faked
-- both with program-specific columns on poe_signups / poe_participants:
--
--   1. "This student is an Optio Academy student."  Until now this was INFERRED
--      from users.organization_id IS NULL (see utils/accreditation.py). That
--      proxy breaks for exactly the population this program creates: a partner's
--      participants are org-managed under the PARTNER, so the inference returns
--      'none' and their transcript loses its accreditation statement. Every
--      organization in prod carries accreditation_source='none' today, Optio
--      Academy's own org included, so there is no org-level value to fall back
--      on either. Make the enrollment a row and read it directly.
--
--   2. "Send this student's transcript to this registrar."  The destination was
--      typed by hand into the Transfer to School modal at send time, per send.
--      The registration funnel now asks once, at enrollment, and stores it.
--
-- Backend reads/writes via the admin client (Optio uses a custom JWT, not
-- Supabase auth.uid()), so RLS is enabled with no policies: that denies direct
-- Data API / anon access while the admin client bypasses RLS. Default data-API
-- grants come from 20260527_restore_default_data_api_grants.sql.

-- 1. Optio Academy enrollment ------------------------------------------------

CREATE TABLE IF NOT EXISTS public.academy_enrollments (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,

    -- Which Optio Academy relationship this is. 'partner_credit' is the credit
    -- partner program; the other two are the existing Academy offerings.
    pathway         text NOT NULL
                    CHECK (pathway IN ('full_time', 'parent_supported', 'partner_credit')),
    status          text NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active', 'completed', 'withdrawn')),

    -- The partner whose program brought them in (null for direct Academy
    -- students). NOT the student's users.organization_id, which may be this
    -- org, a different school, or null.
    partner_org_id  uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
    -- The funnel run that created this row, when it came from registration.
    registration_id uuid REFERENCES public.registrations(id) ON DELETE SET NULL,

    grade_level     text,
    enrolled_at     timestamptz NOT NULL DEFAULT now(),
    withdrawn_at    timestamptz,
    notes           text,

    created_by      uuid REFERENCES public.users(id) ON DELETE SET NULL,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

-- One ACTIVE enrollment per student, while still keeping the history of a
-- student who withdrew and later came back through a different partner.
CREATE UNIQUE INDEX IF NOT EXISTS idx_academy_enrollments_active_user
    ON public.academy_enrollments (user_id) WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_academy_enrollments_partner_org
    ON public.academy_enrollments (partner_org_id) WHERE partner_org_id IS NOT NULL;

ALTER TABLE public.academy_enrollments ENABLE ROW LEVEL SECURITY;

-- 2. Where this student's records go -----------------------------------------

CREATE TABLE IF NOT EXISTS public.student_records_destination (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             uuid NOT NULL UNIQUE REFERENCES public.users(id) ON DELETE CASCADE,

    --   'school'      transcript goes to a school's registrar
    --   'homeschool'  homeschooling; Optio issues a standalone transcript
    --   'optio_only'  not enrolled anywhere; Optio holds the record
    destination_type    text NOT NULL
                        CHECK (destination_type IN ('school', 'homeschool', 'optio_only')),

    school_name         text,
    school_city         text,
    school_state        text,
    school_district     text,
    registrar_name      text,
    registrar_email     text,
    registrar_phone     text,
    student_id_at_school text,

    -- Emailing a minor's transcript and date of birth to a third party is
    -- outward-facing, so the family authorizes it explicitly. Without this,
    -- a credit award notifies the family and waits for them to ask.
    auto_send_consent   boolean NOT NULL DEFAULT false,
    consent_captured_at timestamptz,
    consent_captured_by uuid REFERENCES public.users(id) ON DELETE SET NULL,

    updated_by          uuid REFERENCES public.users(id) ON DELETE SET NULL,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),

    -- A school destination is useless without the school's name; the other two
    -- destination types must not carry stale school fields.
    CONSTRAINT student_records_destination_school_named
        CHECK (destination_type <> 'school' OR nullif(btrim(school_name), '') IS NOT NULL)
);

ALTER TABLE public.student_records_destination ENABLE ROW LEVEL SECURITY;
