-- SIS teachers for Optio courses offered through a partner org (iCreate).
--
-- org_classes already carries a teacher via primary_instructor_id, but the
-- "iCreate versions of Optio courses" on the SIS Classes page are global
-- `courses` rows with no org-scoped record to hang a teacher on. This table
-- maps (organization, course) -> teacher so each org can assign its own staff
-- to the at-home-learning courses it offers.
--
-- ADDITIVE ONLY. RLS-locked (no policies = deny-all to anon/authenticated);
-- the Flask backend reaches it via the service_role client, matching the rest
-- of the SIS tables.

create table if not exists public.org_course_teachers (
    id               uuid primary key default gen_random_uuid(),
    organization_id  uuid not null references public.organizations(id) on delete cascade,
    course_id        uuid not null references public.courses(id) on delete cascade,
    teacher_id       uuid not null references public.users(id) on delete cascade,
    assigned_by      uuid references public.users(id) on delete set null,
    created_at       timestamptz not null default now(),
    updated_at       timestamptz not null default now(),
    unique (organization_id, course_id)
);
create index if not exists idx_org_course_teachers_org on public.org_course_teachers(organization_id);
create index if not exists idx_org_course_teachers_teacher on public.org_course_teachers(teacher_id);

alter table public.org_course_teachers enable row level security;
