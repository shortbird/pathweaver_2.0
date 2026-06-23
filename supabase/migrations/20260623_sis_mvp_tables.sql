-- SIS MVP — additive tables for the microschool Student Information System.
--
-- ADDITIVE ONLY: creates 4 new tables. Does NOT alter users/organizations or any
-- existing table, so it cannot affect current LMS features. All four are org-scoped
-- and RLS-locked (no policies = deny-all to anon/authenticated). The Flask backend
-- reaches them via the service_role client (BYPASSRLS), matching the rest of the app
-- (frontends never query these tables directly — see CLAUDE.md / postgrest-rpc-not-used).
--
-- Households GROUP existing parent_student_links into a family unit; they do not
-- replace the link/guardian model.

-- ── households: a family unit within a school ────────────────────────────────
create table if not exists public.households (
    id                       uuid primary key default gen_random_uuid(),
    organization_id          uuid not null references public.organizations(id) on delete cascade,
    name                     text not null,
    primary_contact_user_id  uuid references public.users(id) on delete set null,
    address_line1            text,
    address_line2            text,
    city                     text,
    state                    text,
    postal_code              text,
    phone                    text,
    notes                    text,
    created_at               timestamptz not null default now(),
    updated_at               timestamptz not null default now()
);
create index if not exists idx_households_org on public.households(organization_id);

-- ── household_members: links students AND guardians into a household ─────────
create table if not exists public.household_members (
    id                  uuid primary key default gen_random_uuid(),
    household_id        uuid not null references public.households(id) on delete cascade,
    user_id             uuid not null references public.users(id) on delete cascade,
    relationship        text not null default 'student',  -- student | guardian | other
    is_primary_guardian boolean not null default false,
    created_at          timestamptz not null default now(),
    unique (household_id, user_id)
);
create index if not exists idx_household_members_household on public.household_members(household_id);
create index if not exists idx_household_members_user on public.household_members(user_id);

-- ── emergency_contacts: per-student, ordered by priority ─────────────────────
create table if not exists public.emergency_contacts (
    id               uuid primary key default gen_random_uuid(),
    student_user_id  uuid not null references public.users(id) on delete cascade,
    organization_id  uuid references public.organizations(id) on delete cascade,
    name             text not null,
    relationship     text,
    phone            text,
    email            text,
    priority         integer not null default 1,
    created_at       timestamptz not null default now(),
    updated_at       timestamptz not null default now()
);
create index if not exists idx_emergency_contacts_student on public.emergency_contacts(student_user_id);

-- ── school_enrollments: org-level enrollment lifecycle ───────────────────────
-- Distinct from course/quest enrollment (which is per-content). This is the
-- student's standing in the SCHOOL: applicant -> enrolled -> withdrawn/graduated.
create table if not exists public.school_enrollments (
    id               uuid primary key default gen_random_uuid(),
    organization_id  uuid not null references public.organizations(id) on delete cascade,
    student_user_id  uuid not null references public.users(id) on delete cascade,
    status           text not null default 'enrolled'
                       check (status in ('applicant', 'enrolled', 'withdrawn', 'graduated')),
    grade_level      text,
    start_date       date,
    end_date         date,
    created_at       timestamptz not null default now(),
    updated_at       timestamptz not null default now(),
    unique (organization_id, student_user_id)
);
create index if not exists idx_school_enrollments_org on public.school_enrollments(organization_id);
create index if not exists idx_school_enrollments_status on public.school_enrollments(organization_id, status);

-- ── RLS: lock all four to backend-only (service_role bypasses RLS) ───────────
alter table public.households         enable row level security;
alter table public.household_members  enable row level security;
alter table public.emergency_contacts enable row level security;
alter table public.school_enrollments enable row level security;
-- Intentionally NO policies: anon/authenticated get no direct access. All reads
-- and writes go through the Flask backend's service_role client.
