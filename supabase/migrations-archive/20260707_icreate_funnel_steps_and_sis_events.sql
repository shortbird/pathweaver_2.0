-- iCreate registration funnel: post-payment steps + SIS events calendar.
--
-- 1) The funnel gains two explicit steps after the fee:
--      fee -> schedule (build the class schedule) -> appointment (book the
--      customized learning plan appointment) -> completed
--    Existing 'completed' rows are untouched; in-flight rows keep their status.
--
-- 2) sis_events: staff-managed org events shown on the SIS Calendar page
--    (the calendar shows events, not class meetings). Deny-all RLS like every
--    other SIS table — only the backend (service role) reads/writes.

alter table public.icreate_registrations
  add column if not exists schedule_done_at timestamptz,
  add column if not exists appointment_confirmed_at timestamptz;

alter table public.icreate_registrations drop constraint if exists icreate_registrations_status_check;
alter table public.icreate_registrations
  add constraint icreate_registrations_status_check
  check (status in ('verify', 'family', 'details', 'paperwork', 'fee', 'schedule', 'appointment', 'completed'));

create table if not exists public.sis_events (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  title            text not null,
  description      text,
  location         text,
  start_at         timestamptz not null,
  end_at           timestamptz,
  all_day          boolean not null default false,
  created_by       uuid references public.users(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint sis_events_time_order check (end_at is null or end_at >= start_at)
);

create index if not exists sis_events_org_start_idx
  on public.sis_events (organization_id, start_at);

alter table public.sis_events enable row level security;
