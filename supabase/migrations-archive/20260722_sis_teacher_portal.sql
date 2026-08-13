-- Teacher/staff portal (iCreate request, 2026-07-22): staff profiles, duties,
-- staff knowledge-base acknowledgments, form submissions, onboarding checklists,
-- and the hourly time clock. All tables are RLS-locked to backend-only (service
-- role), same as the other sis_* tables.

-- ── Staff profiles (employment metadata; NOT payroll processing) ─────────────
create table if not exists public.sis_staff_profiles (
  user_id uuid primary key references public.users(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  position text,
  staff_type text check (staff_type in ('employee', 'contractor')),
  pay_type text check (pay_type in ('hourly', 'salaried', 'stipend', 'unpaid')),
  payroll_id text,
  hourly_rate_cents integer check (hourly_rate_cents is null or hourly_rate_cents >= 0),
  emergency_contact_name text,
  emergency_contact_phone text,
  work_schedule text,
  start_date date,
  end_date date,
  is_active boolean not null default true,
  uses_time_clock boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.sis_staff_profiles enable row level security;
create index if not exists sis_staff_profiles_org_idx on public.sis_staff_profiles (organization_id);

-- ── Non-class duties/shifts (lunch, recess, arrival, events, CLP meetings) ───
create table if not exists public.sis_staff_assignments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  title text not null,
  assignment_type text not null default 'duty'
    check (assignment_type in ('duty', 'event', 'meeting', 'substitute', 'other')),
  day_of_week integer check (day_of_week between 0 and 6),
  specific_date date,
  start_time time,
  end_time time,
  location text,
  notes text,
  created_by uuid references public.users(id),
  created_at timestamptz not null default now()
);
alter table public.sis_staff_assignments enable row level security;
create index if not exists sis_staff_assignments_org_user_idx
  on public.sis_staff_assignments (organization_id, user_id);

-- ── Staff knowledge base: audience + required-read acknowledgments ───────────
alter table public.org_resources
  add column if not exists audience text not null default 'families'
    check (audience in ('families', 'staff', 'all'));
alter table public.org_resources
  add column if not exists requires_ack boolean not null default false;
alter table public.org_resources
  add column if not exists version_date timestamptz;

create table if not exists public.sis_resource_acks (
  id uuid primary key default gen_random_uuid(),
  resource_id uuid not null references public.org_resources(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  version_date timestamptz,
  acknowledged_at timestamptz not null default now(),
  unique (resource_id, user_id)
);
alter table public.sis_resource_acks enable row level security;

-- ── Staff forms (incident, supply, maintenance, ...) ─────────────────────────
create table if not exists public.sis_form_submissions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  submitted_by uuid not null references public.users(id) on delete cascade,
  form_type text not null,
  title text,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'submitted'
    check (status in ('submitted', 'under_review', 'resolved')),
  assigned_to uuid references public.users(id),
  resolution_notes text,
  resolved_by uuid references public.users(id),
  resolved_at timestamptz,
  student_user_id uuid references public.users(id),
  class_id uuid references public.org_classes(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.sis_form_submissions enable row level security;
create index if not exists sis_form_submissions_org_status_idx
  on public.sis_form_submissions (organization_id, status);
create index if not exists sis_form_submissions_submitter_idx
  on public.sis_form_submissions (submitted_by);

-- ── Onboarding checklists ────────────────────────────────────────────────────
create table if not exists public.sis_onboarding_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  role_type text,
  items jsonb not null default '[]'::jsonb,
  created_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.sis_onboarding_templates enable row level security;
create index if not exists sis_onboarding_templates_org_idx
  on public.sis_onboarding_templates (organization_id);

create table if not exists public.sis_onboarding_assignments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  template_id uuid references public.sis_onboarding_templates(id) on delete set null,
  template_name text,
  items jsonb not null default '[]'::jsonb,
  status text not null default 'in_progress' check (status in ('in_progress', 'complete')),
  assigned_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.sis_onboarding_assignments enable row level security;
create index if not exists sis_onboarding_assignments_org_user_idx
  on public.sis_onboarding_assignments (organization_id, user_id);

-- ── Time clock ───────────────────────────────────────────────────────────────
create table if not exists public.sis_time_entries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  clock_in timestamptz not null,
  clock_out timestamptz,
  work_date date not null,
  class_id uuid references public.org_classes(id),
  job_label text,
  notes text,
  status text not null default 'open'
    check (status in ('open', 'submitted', 'approved', 'rejected')),
  edited_by uuid references public.users(id),
  edit_reason text,
  approved_by uuid references public.users(id),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.sis_time_entries enable row level security;
create index if not exists sis_time_entries_org_user_date_idx
  on public.sis_time_entries (organization_id, user_id, work_date);
