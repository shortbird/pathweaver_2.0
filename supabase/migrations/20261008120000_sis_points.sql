-- School points: a ledger staff add to and take from, per student.
--
-- Apogee Cache Valley, 2026-10-08: "we need something where we can quickly
-- click a button and add 5 points for 'daily job' to each students name, where
-- it will track their total number of points over time and let us subtract
-- customizable amounts for things like 'park trip' or 'crochet kit.'" This
-- replaces their ClassDojo.
--
-- Points are not XP and not the spendable-XP wallet (student_wallets): every
-- XP award credits the wallet, and the school wants points that only staff
-- and bounties give. A bounty may give both (a book report presented to the
-- class: XP for the work, points for the school).
--
-- sis_point_entries is the ledger. amount is signed: positive for an award,
-- negative for a spend. A balance is the sum, read through
-- sis_point_balances so an org with years of daily awards is never summed
-- row by row in Python (PostgREST truncates at 1,000 rows).
--
-- sis_point_buttons are the school's quick buttons ("Daily job +5",
-- "Park trip -20"), in their own table so a write never has to merge into
-- organizations.feature_flags.
--
-- RLS on, no policies: read and written through the service role by
-- backend/repositories/sis_points_repository.py, behind the role and
-- relationship checks in routes/sis/points.py. The view is security_invoker,
-- so it answers to the same RLS as the ledger and shows the Data API nothing.
-- No per-table GRANT (Data API grants are inherited).

CREATE TABLE IF NOT EXISTS public.sis_point_entries (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    student_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    amount integer NOT NULL,
    reason text NOT NULL,
    source text NOT NULL DEFAULT 'staff',
    bounty_id uuid REFERENCES public.bounties(id) ON DELETE SET NULL,
    created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT sis_point_entries_amount CHECK (amount <> 0 AND amount BETWEEN -100000 AND 100000),
    CONSTRAINT sis_point_entries_reason CHECK (char_length(reason) BETWEEN 1 AND 200),
    CONSTRAINT sis_point_entries_source CHECK (source IN ('staff', 'bounty'))
);

CREATE INDEX IF NOT EXISTS sis_point_entries_org_student_idx
    ON public.sis_point_entries (organization_id, student_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS sis_point_entries_org_created_idx
    ON public.sis_point_entries (organization_id, created_at DESC);

ALTER TABLE public.sis_point_entries ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE VIEW public.sis_point_balances
WITH (security_invoker = true) AS
SELECT organization_id,
       student_user_id,
       sum(amount)::integer AS balance,
       sum(amount) FILTER (WHERE amount > 0)::integer AS earned,
       (-sum(amount) FILTER (WHERE amount < 0))::integer AS spent
FROM public.sis_point_entries
GROUP BY organization_id, student_user_id;

CREATE TABLE IF NOT EXISTS public.sis_point_buttons (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    label text NOT NULL,
    amount integer NOT NULL,
    sort_order integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT sis_point_buttons_amount CHECK (amount <> 0 AND amount BETWEEN -100000 AND 100000),
    CONSTRAINT sis_point_buttons_label CHECK (char_length(label) BETWEEN 1 AND 60)
);

CREATE INDEX IF NOT EXISTS sis_point_buttons_org_idx
    ON public.sis_point_buttons (organization_id, sort_order);

ALTER TABLE public.sis_point_buttons ENABLE ROW LEVEL SECURITY;
