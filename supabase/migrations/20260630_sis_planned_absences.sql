-- SIS — parent-reported planned absences (iCreate).
--
-- ADDITIVE ONLY. Guardians proactively report that a student will be out: for a
-- whole day (class_id NULL) or from a specific scheduled class (class_id set), on
-- today's date or a future date. Distinct from teacher-recorded sis_attendance
-- (which is the actual roster). Staff see these on the attendance roster; the org
-- admin team is notified when one is reported. Org-scoped, RLS-enabled, backend-only.

create table if not exists public.student_planned_absences (
    id               uuid primary key default gen_random_uuid(),
    organization_id  uuid not null references public.organizations(id) on delete cascade,
    student_user_id  uuid not null references public.users(id) on delete cascade,
    -- NULL class_id = the whole day; a set class_id = just that scheduled class.
    class_id         uuid references public.org_classes(id) on delete cascade,
    absence_date     date not null,
    reason           text,
    status           text not null default 'active'
                       check (status in ('active', 'cancelled')),
    reported_by      uuid references public.users(id) on delete set null,
    created_at       timestamptz not null default now(),
    updated_at       timestamptz not null default now()
);

-- One active report per (student, date, class scope). A whole-day report and a
-- class-specific report coexist (different class_id, NULLs distinct in btree),
-- which is fine; the partial unique index just stops exact duplicates.
create unique index if not exists uq_planned_absence_active
    on public.student_planned_absences (student_user_id, absence_date, class_id)
    where status = 'active';

create index if not exists idx_planned_absence_org_date
    on public.student_planned_absences (organization_id, absence_date);
create index if not exists idx_planned_absence_student_date
    on public.student_planned_absences (student_user_id, absence_date);
create index if not exists idx_planned_absence_class_date
    on public.student_planned_absences (class_id, absence_date);

alter table public.student_planned_absences enable row level security;

comment on table public.student_planned_absences is 'Parent-reported planned absences (whole-day or per-class). Backend-only; distinct from teacher-recorded sis_attendance.';
comment on column public.student_planned_absences.class_id is 'NULL = whole day out; set = absent from just this scheduled class.';
