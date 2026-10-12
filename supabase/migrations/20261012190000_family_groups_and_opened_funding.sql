-- Family groups, and OpenEd as a funding source.
--
-- The 53 Optio Academy families who came from Hearthwood Academy (2026-10-02)
-- are OpenEd families: OpenEd pays Optio Academy for them, and they get their
-- own emails. Two facts, two places:
--
--   households.funding_source = 'opened'   WHO PAYS. Read by every billing
--       surface through sis_payment_profile.FUNDERS: the family is told OpenEd
--       pays and is not offered card payment. Only staff can set it.
--
--   family_groups / household_family_groups   WHICH COHORT. A school's own
--       named groups of families ("OpenEd"), so the office and the email
--       lists can pick them out. A family can be in several groups, and a
--       group says nothing about money.
--
-- Service-role only: RLS on, no policies. Every route that reads or writes
-- these is behind ADMIN_ROLES with the household-belongs-to-org check, or
-- behind require_superadmin (/admin/crm/lists).

ALTER TABLE public.households DROP CONSTRAINT IF EXISTS households_funding_source_check;
ALTER TABLE public.households ADD CONSTRAINT households_funding_source_check
    CHECK (funding_source IS NULL
           OR funding_source = ANY (ARRAY['ufa', 'ufa_private', 'private_pay', 'other', 'opened']));

CREATE TABLE IF NOT EXISTS public.family_groups (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    name text NOT NULL CHECK (length(btrim(name)) > 0),
    created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS family_groups_org_name_idx
    ON public.family_groups (organization_id, lower(btrim(name)));

CREATE TABLE IF NOT EXISTS public.household_family_groups (
    -- A unique single column so org-wide reads can page past the 1,000-row
    -- cap (utils/db_fetch.fetch_all_rows orders by id).
    id uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
    household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
    group_id uuid NOT NULL REFERENCES public.family_groups(id) ON DELETE CASCADE,
    added_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (household_id, group_id)
);

CREATE INDEX IF NOT EXISTS household_family_groups_group_idx
    ON public.household_family_groups (group_id);

ALTER TABLE public.family_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.household_family_groups ENABLE ROW LEVEL SECURITY;
