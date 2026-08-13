-- SIS Phase 6 — class-level attendance (spec §4.8).
--
-- ADDITIVE ONLY. One row per (class, student, date). Teachers record present/absent/
-- late/excused; parents and admins can read it. Org-scoped, RLS-enabled, backend-only.

create table if not exists public.sis_attendance (
    id               uuid primary key default gen_random_uuid(),
    organization_id  uuid not null references public.organizations(id) on delete cascade,
    class_id         uuid not null references public.org_classes(id) on delete cascade,
    meeting_id       uuid references public.class_meetings(id) on delete set null,
    student_user_id  uuid not null references public.users(id) on delete cascade,
    date             date not null,
    status           text not null default 'present'
                       check (status in ('present', 'absent', 'late', 'excused')),
    note             text,
    recorded_by      uuid references public.users(id) on delete set null,
    created_at       timestamptz not null default now(),
    updated_at       timestamptz not null default now(),
    unique (class_id, student_user_id, date)
);
create index if not exists idx_sis_attendance_class_date on public.sis_attendance(class_id, date);
create index if not exists idx_sis_attendance_student on public.sis_attendance(student_user_id);
create index if not exists idx_sis_attendance_org on public.sis_attendance(organization_id);

alter table public.sis_attendance enable row level security;
