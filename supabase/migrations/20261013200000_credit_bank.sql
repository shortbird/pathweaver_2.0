-- The credit bank: credits a student has paid for, waiting to be earned.
--
-- Optio Academy sells credits ahead of the work (Tanner, 2026-10-13):
--   - an OpenEd family buys the year from OpenEd, which carries 6 credits,
--     banked when the student enrolls;
--   - a self-pay family pays monthly tuition, and each paid month banks
--     tuition / credit price (0.5 today) for each student the payment covers;
--   - anyone can buy accelerated credits, a whole credit or a half
--     (prices in shared/data/pricing.json).
-- A credit is USED when credit review approves it onto the transcript. The
-- balance is the sum of these rows minus the credits approved since the
-- student enrolled (services/credit_bank_service.py); it may go negative,
-- which shows as owed and blocks nothing.
--
-- Append-only. A mistake gets a correcting row (kind 'adjustment', negative
-- credits, a note saying why); nothing updates or deletes a row, so the
-- ledger is its own history.
--
-- `reference` makes the automatic rows idempotent: one row per student per
-- reference ('opened-year:2026-27', 'stripe-invoice:in_...',
-- 'sis-payment:<id>'), so a sweep that runs twice banks once.
--
-- Service-role only: RLS on, no policies.

CREATE TABLE IF NOT EXISTS public.credit_bank_entries (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    student_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    credits numeric(5,2) NOT NULL
        CHECK (credits <> 0 AND credits * 2 = round(credits * 2)),
    kind text NOT NULL
        CHECK (kind = ANY (ARRAY['included', 'monthly', 'accelerated', 'adjustment'])),
    source text NOT NULL
        CHECK (source = ANY (ARRAY['opened', 'stripe', 'sis_autopay', 'manual'])),
    reference text,
    note text,
    entered_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS credit_bank_entries_student_idx
    ON public.credit_bank_entries (student_user_id, created_at);

CREATE UNIQUE INDEX IF NOT EXISTS credit_bank_entries_reference_idx
    ON public.credit_bank_entries (student_user_id, reference)
    WHERE reference IS NOT NULL;

ALTER TABLE public.credit_bank_entries ENABLE ROW LEVEL SECURITY;
