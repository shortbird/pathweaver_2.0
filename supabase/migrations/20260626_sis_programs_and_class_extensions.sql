-- SIS Phase 1 — Programs + the unified "Class" (org_classes) operational extensions.
--
-- ADDITIVE ONLY. Creates 3 new tables (programs, class_meetings, class_prerequisites)
-- and adds NULLABLE/defaulted columns to the existing org_classes. No existing table's
-- data is changed; every new org_classes column is optional, so the 14 existing
-- teaching cohorts across 5 orgs are unaffected (they simply don't use the SIS fields).
--
-- This unifies the SIS "Class" (a registration + scheduling unit a family enrolls a
-- student into) onto org_classes, which already carries roster (class_enrollments),
-- instructors (class_advisors), and content (class_quests). See
-- docs/SIS_ARCHITECTURE_DISCOVERY.md §1.5 and docs/SIS_IMPLEMENTATION_PLAN.md (M1).
--
-- New tables are org-scoped and RLS-enabled with NO policies (deny-all to
-- anon/authenticated). The Flask backend reaches them via the service_role client
-- (BYPASSRLS), matching the SIS MVP (20260623_sis_mvp_tables.sql). Default Data API
-- grants are inherited (20260527_restore_default_data_api_grants.sql).

-- ── programs: a container grouping Classes (Full-Day, Half-Day, Workshop, …) ──
create table if not exists public.programs (
    id                    uuid primary key default gen_random_uuid(),
    organization_id       uuid not null references public.organizations(id) on delete cascade,
    name                  text not null,
    slug                  text,
    description           text,
    program_type          text not null default 'individual_class'
                            check (program_type in (
                              'full_day', 'half_day', 'individual_class',
                              'workshop', 'camp', 'event', 'online'
                            )),
    status                text not null default 'draft'
                            check (status in ('draft', 'published', 'archived')),
    enrollment_opens_at   timestamptz,
    enrollment_closes_at   timestamptz,
    created_by            uuid references public.users(id) on delete set null,
    created_at            timestamptz not null default now(),
    updated_at            timestamptz not null default now(),
    unique (organization_id, slug)
);
create index if not exists idx_programs_org on public.programs(organization_id);
create index if not exists idx_programs_status on public.programs(organization_id, status);

-- ── org_classes: SIS operational columns (all optional → existing rows unaffected) ──
alter table public.org_classes
    add column if not exists program_id           uuid references public.programs(id) on delete set null,
    add column if not exists capacity             integer,                          -- null = unlimited
    add column if not exists primary_instructor_id uuid references public.users(id) on delete set null,
    add column if not exists price_cents          integer,
    add column if not exists billing_type         text
                              check (billing_type is null or billing_type in ('flat', 'per_class', 'recurring')),
    add column if not exists billing_cadence      text
                              check (billing_cadence is null or billing_cadence in ('monthly', 'semester', 'full')),
    add column if not exists min_age              integer,
    add column if not exists max_age              integer,
    add column if not exists location             text,
    add column if not exists waitlist_enabled     boolean not null default true,
    add column if not exists registration_status  text not null default 'closed'
                              check (registration_status in ('open', 'closed'));

create index if not exists idx_org_classes_program on public.org_classes(program_id);

-- ── class_meetings: schedule for a Class (recurring weekly OR one-off date) ───
-- Used for the calendar view, attendance sessions, and schedule-conflict detection.
create table if not exists public.class_meetings (
    id               uuid primary key default gen_random_uuid(),
    class_id         uuid not null references public.org_classes(id) on delete cascade,
    organization_id  uuid not null references public.organizations(id) on delete cascade,
    day_of_week      integer check (day_of_week is null or day_of_week between 0 and 6), -- 0=Sun … 6=Sat
    specific_date    date,                                                                -- one-off meeting
    start_time       time not null,
    end_time         time not null,
    location         text,
    created_at       timestamptz not null default now(),
    updated_at       timestamptz not null default now(),
    -- a meeting is either recurring (day_of_week) or one-off (specific_date), not neither
    check (day_of_week is not null or specific_date is not null)
);
create index if not exists idx_class_meetings_class on public.class_meetings(class_id);
create index if not exists idx_class_meetings_org on public.class_meetings(organization_id);

-- ── class_prerequisites: optional eligibility (soft warn + admin override) ────
create table if not exists public.class_prerequisites (
    id                    uuid primary key default gen_random_uuid(),
    class_id              uuid not null references public.org_classes(id) on delete cascade,
    prerequisite_class_id uuid references public.org_classes(id) on delete cascade,
    note                  text,                       -- free-text prereq when not a class
    created_at            timestamptz not null default now()
);
create index if not exists idx_class_prerequisites_class on public.class_prerequisites(class_id);

-- ── RLS: backend-only (service_role bypasses; no policies = deny-all) ─────────
alter table public.programs            enable row level security;
alter table public.class_meetings      enable row level security;
alter table public.class_prerequisites enable row level security;
</content>
