-- Ticket e7a50b4b (iCreate, advisor): "I would like to see what I have spent on
-- each class supply budget already/how much I have left."
--
-- The budget's spend used to come only from supply_request / reimbursement
-- form submissions, which were retired into tasks on 2026-09-24. Nothing has
-- counted against a budget since. This is the class's own expense log: a
-- teacher writes down what they bought, and the class page subtracts it.
--
-- Written by the class's teachers (their own entries) and the front office
-- (all entries), through the supply-expenses routes in
-- backend/routes/sis/staff_portal.py.
--
-- RLS on, no policies: read and written through the service role by
-- backend/services/sis_supply_expense_service.py, behind the role and class
-- scope checks in the route. No per-table GRANT (Data API grants are
-- inherited).

CREATE TABLE IF NOT EXISTS public.sis_class_supply_expenses (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    class_id uuid NOT NULL REFERENCES public.org_classes(id) ON DELETE CASCADE,
    amount_cents integer NOT NULL,
    description text NOT NULL,
    spent_on date NOT NULL DEFAULT current_date,
    created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT sis_class_supply_expenses_amount CHECK (amount_cents > 0),
    CONSTRAINT sis_class_supply_expenses_description CHECK (char_length(description) BETWEEN 1 AND 200)
);

CREATE INDEX IF NOT EXISTS sis_class_supply_expenses_class_idx
    ON public.sis_class_supply_expenses (class_id, spent_on DESC);
CREATE INDEX IF NOT EXISTS sis_class_supply_expenses_org_idx
    ON public.sis_class_supply_expenses (organization_id);

ALTER TABLE public.sis_class_supply_expenses ENABLE ROW LEVEL SECURITY;
