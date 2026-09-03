-- Open-ended monthly tuition: a set amount per student, charged every month
-- until somebody turns it off.
--
-- Optio Academy (2026-08-31) does not bill a term and split it up. Tuition is a
-- monthly rate that runs until the family leaves, so there is no total and no
-- installment count — which is exactly what sis_payment_plans is built on. A
-- plan needs an invoice to belong to and a number of installments to divide;
-- neither exists here, and faking them (an invoice for an unknown total, a plan
-- of 999 installments) would put a wrong number in front of a parent.
--
-- So the schedule lives in its own row, and the INVOICES stay what they always
-- were: a record of one month's charge, generated when that month comes round.
-- The family portal, the receipts, the ledger and the outstanding report all
-- keep working, because nothing about an invoice changed.
--
-- One row per STUDENT, not per family, so a household with three children has
-- three amounts that can be changed, paused or ended one at a time. The monthly
-- sweep groups a household's active rows into ONE invoice with a line per
-- student and takes ONE card charge for the total: the office asked to see each
-- child's tuition itemised while the parent pays once.

CREATE TABLE IF NOT EXISTS public.sis_recurring_tuition (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  student_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,

  monthly_cents integer NOT NULL CHECK (monthly_cents > 0),
  description text,

  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'paused', 'canceled')),

  -- Capped at 28 so the charge date exists in February. A school that wants
  -- "the last day of the month" gets the 28th; the alternative is a schedule
  -- that silently skips a month every four years.
  day_of_month smallint NOT NULL DEFAULT 1 CHECK (day_of_month BETWEEN 1 AND 28),

  -- NULL until the family has saved a card. An active row with no next_charge_on
  -- is "set up, waiting on the parent" — it is not overdue and must not be swept.
  next_charge_on date,
  last_charged_on date,

  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  canceled_at timestamptz,
  canceled_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- One live schedule per student, but cancelled rows stay for the history — so a
-- student who leaves and returns can be set up again without deleting what they
-- were charged before.
CREATE UNIQUE INDEX IF NOT EXISTS sis_recurring_tuition_one_live_per_student
  ON public.sis_recurring_tuition (student_user_id)
  WHERE status <> 'canceled';

-- The sweep's query: everything due today, across all orgs.
CREATE INDEX IF NOT EXISTS sis_recurring_tuition_due
  ON public.sis_recurring_tuition (next_charge_on)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS sis_recurring_tuition_household
  ON public.sis_recurring_tuition (household_id);

CREATE INDEX IF NOT EXISTS sis_recurring_tuition_org
  ON public.sis_recurring_tuition (organization_id);

-- SIS tables are backend-only: RLS on, no policies, so PostgREST cannot reach
-- this by construction rather than by remembering to write a correct policy.
-- Authorization is the FINANCE_ROLES gate on /api/sis/tuition/recurring/*.
ALTER TABLE public.sis_recurring_tuition ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.sis_recurring_tuition IS
  'Open-ended monthly tuition: a set amount per student charged every month '
  'until paused or cancelled. One row per student; the monthly sweep groups a '
  'household''s active rows into one invoice (a line per student) and takes one '
  'card charge for the total.';

COMMENT ON COLUMN public.sis_recurring_tuition.next_charge_on IS
  'The next date the sweep should bill this student. NULL means the family has '
  'not saved a card yet — set when the card is saved, advanced a month after '
  'each attempt (success or decline; declines are handed to staff, never '
  'retried the next day).';

COMMENT ON COLUMN public.sis_recurring_tuition.status IS
  'active: swept monthly. paused: kept, with its amount, but skipped (a family '
  'taking a term off). canceled: ended, retained for history and excluded from '
  'the one-live-per-student index.';
