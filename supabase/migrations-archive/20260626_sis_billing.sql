-- SIS Phase 5 — Pricing & billing (RECORD-ONLY).
--
-- ADDITIVE ONLY. Optio CALCULATES tuition, records invoices/payment plans, and logs
-- what to sync to QuickBooks. It does NOT process payments — Simple Biz Suite collects
-- the money; sis_payment_records are records of money taken elsewhere. No card data.
-- See SIS_ARCHITECTURE_DISCOVERY.md §1.5 / SIS_IMPLEMENTATION_PLAN.md (M4).
--
-- Org-scoped, RLS-enabled, backend-only (service_role).

-- ── discount rules ───────────────────────────────────────────────────────────
create table if not exists public.sis_discount_rules (
    id               uuid primary key default gen_random_uuid(),
    organization_id  uuid not null references public.organizations(id) on delete cascade,
    name             text not null,
    rule_type        text not null check (rule_type in ('sibling', 'multi_class', 'promo', 'manual')),
    criteria         jsonb not null default '{}'::jsonb,
    active           boolean not null default true,
    created_at       timestamptz not null default now(),
    updated_at       timestamptz not null default now()
);
create index if not exists idx_sis_discount_rules_org on public.sis_discount_rules(organization_id);

-- ── invoices ─────────────────────────────────────────────────────────────────
create table if not exists public.sis_invoices (
    id                uuid primary key default gen_random_uuid(),
    organization_id   uuid not null references public.organizations(id) on delete cascade,
    household_id      uuid references public.households(id) on delete set null,
    student_user_id   uuid references public.users(id) on delete set null,
    registration_id   uuid references public.sis_registrations(id) on delete set null,
    status            text not null default 'draft'
                        check (status in ('draft', 'sent', 'partial', 'paid', 'overdue', 'void')),
    subtotal_cents    integer not null default 0,
    discount_cents    integer not null default 0,
    total_cents       integer not null default 0,
    amount_paid_cents integer not null default 0,
    issued_at         timestamptz,
    due_date          date,
    quickbooks_id     text,
    created_at        timestamptz not null default now(),
    updated_at        timestamptz not null default now()
);
create index if not exists idx_sis_invoices_org on public.sis_invoices(organization_id);
create index if not exists idx_sis_invoices_household on public.sis_invoices(household_id);
create index if not exists idx_sis_invoices_status on public.sis_invoices(organization_id, status);

create table if not exists public.sis_invoice_line_items (
    id            uuid primary key default gen_random_uuid(),
    invoice_id    uuid not null references public.sis_invoices(id) on delete cascade,
    description   text not null,
    class_id      uuid references public.org_classes(id) on delete set null,
    amount_cents  integer not null default 0,
    quantity      integer not null default 1,
    created_at    timestamptz not null default now()
);
create index if not exists idx_sis_invoice_line_items_invoice on public.sis_invoice_line_items(invoice_id);

-- ── payment plans + installments ─────────────────────────────────────────────
create table if not exists public.sis_payment_plans (
    id                 uuid primary key default gen_random_uuid(),
    invoice_id         uuid not null references public.sis_invoices(id) on delete cascade,
    cadence            text not null check (cadence in ('monthly', 'semester', 'full')),
    installment_count  integer not null default 1,
    status             text not null default 'active' check (status in ('active', 'completed', 'cancelled')),
    created_at         timestamptz not null default now()
);
create index if not exists idx_sis_payment_plans_invoice on public.sis_payment_plans(invoice_id);

create table if not exists public.sis_installments (
    id              uuid primary key default gen_random_uuid(),
    payment_plan_id uuid not null references public.sis_payment_plans(id) on delete cascade,
    due_date        date not null,
    amount_cents    integer not null default 0,
    status          text not null default 'scheduled' check (status in ('scheduled', 'due', 'paid', 'late', 'waived')),
    paid_at         timestamptz,
    late_fee_cents  integer not null default 0,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now()
);
create index if not exists idx_sis_installments_plan on public.sis_installments(payment_plan_id);
create index if not exists idx_sis_installments_status on public.sis_installments(status);

-- ── payment records (money collected in SBS; recorded here) ───────────────────
create table if not exists public.sis_payment_records (
    id              uuid primary key default gen_random_uuid(),
    organization_id uuid not null references public.organizations(id) on delete cascade,
    invoice_id      uuid not null references public.sis_invoices(id) on delete cascade,
    installment_id  uuid references public.sis_installments(id) on delete set null,
    amount_cents    integer not null,
    method          text,
    external_ref    text,                 -- SBS / QuickBooks reference
    recorded_by     uuid references public.users(id) on delete set null,
    recorded_at     timestamptz not null default now(),
    note            text
);
create index if not exists idx_sis_payment_records_invoice on public.sis_payment_records(invoice_id);
create index if not exists idx_sis_payment_records_org on public.sis_payment_records(organization_id);

-- ── QuickBooks sync log (one-way Optio -> QBO; no live API yet) ──────────────
create table if not exists public.sis_quickbooks_sync_log (
    id              uuid primary key default gen_random_uuid(),
    organization_id uuid not null references public.organizations(id) on delete cascade,
    entity_type     text not null check (entity_type in ('invoice', 'payment', 'customer')),
    entity_id       uuid not null,
    quickbooks_id   text,
    status          text not null default 'pending' check (status in ('pending', 'synced', 'error')),
    error           text,
    synced_at       timestamptz,
    created_at      timestamptz not null default now()
);
create index if not exists idx_sis_qbo_sync_org on public.sis_quickbooks_sync_log(organization_id, status);

-- ── RLS: backend-only ────────────────────────────────────────────────────────
alter table public.sis_discount_rules      enable row level security;
alter table public.sis_invoices            enable row level security;
alter table public.sis_invoice_line_items  enable row level security;
alter table public.sis_payment_plans       enable row level security;
alter table public.sis_installments        enable row level security;
alter table public.sis_payment_records     enable row level security;
alter table public.sis_quickbooks_sync_log enable row level security;
