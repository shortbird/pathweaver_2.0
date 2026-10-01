-- A partner's credit class, sold by the partner, and who has a copy of it.
--
-- Raleigh Williams (2026-09-30) sells a critical-thinking course; Optio turns
-- it into a half-credit Language Arts class. His buyers get the class two
-- ways: a public link (/offer/<slug>) that a student opens to sign up or sign
-- in, and an "Add a student" form on his dashboard. Both reach one function,
-- services/partner_offering_service.provision.
--
-- Why a copy per student. A class's transcript_subject and class_review_status
-- live on the quests row, so students sharing one class quest would share one
-- review result. Each student gets their own quest copied from the template
-- (the POE pattern in routes/admin/poe.py, generalised). The template is a
-- quest in the partner's org that the partner edits; later edits reach new
-- students only, which is deliberate: a student's work is judged against the
-- task list they started with.
--
-- This is the lean first cut of partner_offerings in
-- docs/CREDIT_PARTNER_PROGRAM_PLAN.md section 5.3, without the attestation
-- columns a participation-based partner (POE) would need. The enrollment table
-- is named partner_offering_enrollments, not partner_enrollments, because
-- repositories/partner_enrollment_repository.py already means OnFire's course
-- registrations.
--
-- Billing: Optio invoices the partner monthly_fee_cents per enrolled student
-- per month (Tanner, 2026-09-30: $50). ended_at stops the count.
--
-- RLS on, no policies: read and written through the service role by
-- repositories/partner_offering_repository.py behind the route gates. No
-- per-table GRANT (Data API grants are inherited).

CREATE TABLE IF NOT EXISTS public.partner_offerings (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    template_quest_id uuid NOT NULL REFERENCES public.quests(id) ON DELETE RESTRICT,
    slug text NOT NULL,
    monthly_fee_cents integer NOT NULL DEFAULT 5000,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT partner_offerings_slug_unique UNIQUE (slug),
    CONSTRAINT partner_offerings_slug_format CHECK (slug ~ '^[a-z0-9-]{3,60}$'),
    CONSTRAINT partner_offerings_fee_nonnegative CHECK (monthly_fee_cents >= 0)
);

CREATE INDEX IF NOT EXISTS partner_offerings_org_idx
    ON public.partner_offerings (organization_id);

CREATE TABLE IF NOT EXISTS public.partner_offering_enrollments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    offering_id uuid NOT NULL REFERENCES public.partner_offerings(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    class_quest_id uuid REFERENCES public.quests(id) ON DELETE SET NULL,
    source text NOT NULL,
    enrolled_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    ended_at timestamptz,
    CONSTRAINT partner_offering_enrollments_source CHECK (source IN ('link', 'partner')),
    CONSTRAINT partner_offering_enrollments_unique UNIQUE (offering_id, user_id)
);

CREATE INDEX IF NOT EXISTS partner_offering_enrollments_user_idx
    ON public.partner_offering_enrollments (user_id);

ALTER TABLE public.partner_offerings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_offering_enrollments ENABLE ROW LEVEL SECURITY;
