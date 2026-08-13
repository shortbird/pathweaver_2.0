-- SIS tuition auto-pay: saved cards + auto-charge payment plans.
--
-- The tuition-approver flow (CLP finished -> approve tuition -> send invoice)
-- lets a family pay online on the SCHOOL'S OWN Stripe account, either in full or
-- on a 10-payment plan. An auto-charged plan needs a saved card: we create a
-- Stripe Customer + reusable PaymentMethod on the school's account and charge
-- each installment off-session from a daily cron. This matches the rest of SIS
-- billing, which is poll-verified with NO webhook infrastructure.
--
-- We store ONLY Stripe token ids + non-sensitive card display fields (brand,
-- last4, expiry). No PAN / no card data ever touches our DB.
--
-- Org-scoped, RLS-enabled, backend-only (service_role). New public tables inherit
-- the default Data-API grants (see 20260527_restore_default_data_api_grants.sql).

-- ── saved payment methods (per guardian, per org's own Stripe account) ────────
create table if not exists public.sis_saved_payment_methods (
    id                        uuid primary key default gen_random_uuid(),
    organization_id           uuid not null references public.organizations(id) on delete cascade,
    guardian_user_id          uuid not null references public.users(id) on delete cascade,
    household_id              uuid references public.households(id) on delete set null,
    stripe_customer_id        text not null,
    stripe_payment_method_id  text not null,
    card_brand                text,
    card_last4                text,
    card_exp_month            integer,
    card_exp_year             integer,
    created_at                timestamptz not null default now(),
    updated_at                timestamptz not null default now(),
    -- One saved card per guardian per org (re-saving replaces it).
    unique (organization_id, guardian_user_id)
);
create index if not exists idx_sis_saved_pm_org
    on public.sis_saved_payment_methods(organization_id);
create index if not exists idx_sis_saved_pm_guardian
    on public.sis_saved_payment_methods(guardian_user_id);

-- ── auto-charge on payment plans ──────────────────────────────────────────────
-- A 10-payment plan is cadence='monthly', installment_count=10 (no enum change
-- needed). auto_charge=true means the daily cron charges each due installment
-- off-session against the linked saved card; false keeps the existing
-- record-only behaviour (the family pays each installment themselves).
alter table public.sis_payment_plans
    add column if not exists auto_charge boolean not null default false;
alter table public.sis_payment_plans
    add column if not exists saved_payment_method_id uuid
        references public.sis_saved_payment_methods(id) on delete set null;

-- ── auto-charge bookkeeping on installments ───────────────────────────────────
-- The cron records attempts + the last error so a failed off-session charge is
-- visible for dunning, without adding a new value to the installment status enum.
alter table public.sis_installments
    add column if not exists charge_attempts integer not null default 0;
alter table public.sis_installments
    add column if not exists last_attempt_at timestamptz;
alter table public.sis_installments
    add column if not exists last_error text;

-- RLS: backend-only, same posture as the rest of SIS billing.
alter table public.sis_saved_payment_methods enable row level security;
