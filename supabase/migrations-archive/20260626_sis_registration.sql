-- SIS Phase 3 — Registration & enrollment.
--
-- ADDITIVE ONLY. Two new tables capturing a multi-step, resumable, per-student
-- registration (spec §4.2): a student may be registered into multiple Classes in
-- one session; the session can be saved as a draft and resumed; an admin may
-- complete/override it. Completing a registration creates the actual
-- class_enrollments (LMS delivery) + upserts school_enrollments to 'enrolled'.
--
-- Org-scoped, RLS-enabled, no policies (backend service_role only) — matches the
-- rest of the SIS. See docs/SIS_IMPLEMENTATION_PLAN.md (M2).

-- ── sis_registrations: one per student per registration session ──────────────
create table if not exists public.sis_registrations (
    id                uuid primary key default gen_random_uuid(),
    organization_id   uuid not null references public.organizations(id) on delete cascade,
    household_id      uuid references public.households(id) on delete set null,
    guardian_user_id  uuid references public.users(id) on delete set null,
    student_user_id   uuid not null references public.users(id) on delete cascade,
    status            text not null default 'draft'
                        check (status in ('draft', 'in_progress', 'submitted', 'completed', 'cancelled')),
    current_step      text,
    notes             text,
    submitted_at      timestamptz,
    completed_at      timestamptz,
    completed_by      uuid references public.users(id) on delete set null,
    created_at        timestamptz not null default now(),
    updated_at        timestamptz not null default now()
);
create index if not exists idx_sis_registrations_org on public.sis_registrations(organization_id);
create index if not exists idx_sis_registrations_student on public.sis_registrations(student_user_id);
create index if not exists idx_sis_registrations_status on public.sis_registrations(organization_id, status);

-- ── sis_registration_items: each Class selected within a registration ────────
create table if not exists public.sis_registration_items (
    id                      uuid primary key default gen_random_uuid(),
    registration_id         uuid not null references public.sis_registrations(id) on delete cascade,
    class_id                uuid not null references public.org_classes(id) on delete cascade,
    program_id              uuid references public.programs(id) on delete set null,
    status                  text not null default 'selected'
                              check (status in ('selected', 'enrolled', 'waitlisted', 'dropped')),
    price_snapshot_cents    integer,
    discount_snapshot_cents integer not null default 0,
    created_at              timestamptz not null default now(),
    updated_at              timestamptz not null default now(),
    unique (registration_id, class_id)
);
create index if not exists idx_sis_registration_items_reg on public.sis_registration_items(registration_id);
create index if not exists idx_sis_registration_items_class on public.sis_registration_items(class_id);

-- ── RLS: backend-only ────────────────────────────────────────────────────────
alter table public.sis_registrations      enable row level security;
alter table public.sis_registration_items enable row level security;
