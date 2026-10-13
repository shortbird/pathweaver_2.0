-- Family group managers: someone outside the school who looks after one group.
--
-- OpenEd pays Optio Academy for its families and sent Tanner a weekly
-- spreadsheet of students to add and drop (2026-09 through 2026-10-12). Eliza
-- Paskett at OpenEd now does it herself, on a page that shows only the OpenEd
-- group. She is not Optio Academy staff and must not see the other families,
-- the billing or the console, so this is a grant on the GROUP, not a role in
-- the org.
--
--   family_group_managers   who may open a group's dashboard. Granted by a
--       superadmin; the dashboard routes check it on every request.
--
--   family_groups.funding_source / academy_pathway   what a family added from
--       that dashboard is given: OpenEd families are funding_source 'opened'
--       and their students hold a parent_supported Academy enrollment. NULL
--       means the dashboard leaves that fact alone.
--
-- Service-role only, like family_groups: RLS on, no policies.

CREATE TABLE IF NOT EXISTS public.family_group_managers (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id uuid NOT NULL REFERENCES public.family_groups(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (group_id, user_id)
);

CREATE INDEX IF NOT EXISTS family_group_managers_user_idx
    ON public.family_group_managers (user_id);

ALTER TABLE public.family_group_managers ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.family_groups ADD COLUMN IF NOT EXISTS funding_source text
    CHECK (funding_source IS NULL
           OR funding_source = ANY (ARRAY['ufa', 'ufa_private', 'private_pay', 'other', 'opened']));
ALTER TABLE public.family_groups ADD COLUMN IF NOT EXISTS academy_pathway text
    CHECK (academy_pathway IS NULL
           OR academy_pathway = ANY (ARRAY['full_time', 'parent_supported', 'partner_credit']));

UPDATE public.family_groups
   SET funding_source = 'opened', academy_pathway = 'parent_supported'
 WHERE id = 'b37907e3-820a-4e2c-9d46-1e3681eb6ada';
