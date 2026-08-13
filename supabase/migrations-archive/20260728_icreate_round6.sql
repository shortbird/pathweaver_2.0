-- iCreate feedback round 6 (2026-07-28)
--
-- Five additive changes, all org-scoped and RLS-locked to the backend service
-- role (same model as class_materials / sis_secure_documents — no policies by
-- design; authorization is enforced in Python above every read and write):
--
--   1. sis_curriculum + sis_curriculum_classes — an org-level curriculum library
--      that exists independently of whether a subject is being taught this term.
--      Teacher-facing, NOT student-facing (that distinction is the whole point:
--      class_materials are shown to enrolled students, curriculum is not).
--   2. org_classes.supply_budget_per_student — the per-class override for the
--      "up to $XX per student, included in tuition" allowance that sits on top
--      of supply_fee. The org-wide default lives in
--      feature_flags.sis_settings.supply_budget_per_student (no DDL needed).
--   3. sis_secure_documents.shared_with_owner — opt-in, default FALSE. A
--      sensitive document is invisible to the person it is about until an admin
--      explicitly shares it. Background checks must not become self-service.
--   4. sis_staff_training — the org's catalog of training quests for staff
--      (onboarding walkthroughs, "Classroom Management", etc). Completion is
--      read from the normal quest tables; this table only says which quests are
--      training and how they are presented.
--   5. sis_staff_profiles.archived_at — placeholder/departed staff are archived
--      (hidden) rather than deleted whenever they carry history.

-- ── 1. Curriculum library ────────────────────────────────────────────────────

create table if not exists public.sis_curriculum (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  title            text not null,
  subject          text,                   -- free text grouping, e.g. "Reading"
  description      text,
  drive_url        text,                   -- the Google Drive folder (or any link)
  notes            text,                   -- staff-only planning notes
  is_active        boolean not null default true,
  created_by       uuid references public.users(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists sis_curriculum_org_idx
  on public.sis_curriculum (organization_id, is_active, title);

alter table public.sis_curriculum enable row level security;

-- A curriculum may be attached to many classes (the four Reading Workshop
-- sections share one entry), and a class may draw on more than one.
create table if not exists public.sis_curriculum_classes (
  id             uuid primary key default gen_random_uuid(),
  curriculum_id  uuid not null references public.sis_curriculum(id) on delete cascade,
  class_id       uuid not null references public.org_classes(id) on delete cascade,
  created_at     timestamptz not null default now(),
  unique (curriculum_id, class_id)
);

create index if not exists sis_curriculum_classes_class_idx
  on public.sis_curriculum_classes (class_id);

alter table public.sis_curriculum_classes enable row level security;

-- ── 2. Per-class supply budget allowance ─────────────────────────────────────
-- Dollars per enrolled student per YEAR, on top of supply_fee. NULL means "use
-- the org default"; 0 means "explicitly no allowance for this class".
alter table public.org_classes
  add column if not exists supply_budget_per_student numeric(10, 2);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'chk_org_classes_supply_budget_nonneg'
  ) then
    alter table public.org_classes
      add constraint chk_org_classes_supply_budget_nonneg
      check (supply_budget_per_student is null or supply_budget_per_student >= 0);
  end if;
end $$;

-- ── 3. Secure documents: opt-in visibility to the person they are about ──────
alter table public.sis_secure_documents
  add column if not exists shared_with_owner boolean not null default false;

-- Uploads made by the staff member themselves (a signed contract photo) are
-- distinguishable from admin-filed documents, so the teacher's own view can
-- show "you sent this" vs "the school shared this".
alter table public.sis_secure_documents
  add column if not exists uploaded_by_owner boolean not null default false;

create index if not exists idx_sis_secure_documents_owner_shared
  on public.sis_secure_documents (organization_id, owner_user_id, shared_with_owner);

-- ── 4. Staff training catalog ────────────────────────────────────────────────

create table if not exists public.sis_staff_training (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  quest_id         uuid not null references public.quests(id) on delete cascade,
  category         text,                   -- e.g. "Onboarding", "Classroom management"
  is_required      boolean not null default false,
  sequence_order   integer not null default 0,
  created_by       uuid references public.users(id) on delete set null,
  created_at       timestamptz not null default now(),
  unique (organization_id, quest_id)
);

create index if not exists sis_staff_training_org_idx
  on public.sis_staff_training (organization_id, sequence_order);

alter table public.sis_staff_training enable row level security;

-- ── 4b. Bounties: who they are for ───────────────────────────────────────────
-- Teachers can now claim bounties (training bonuses), which they never could
-- before. Rather than opening every bounty to staff — which would let a teacher
-- claim a bounty a parent posted for their own child — each bounty declares its
-- audience. Existing rows default to 'students', preserving today's behavior
-- exactly.
alter table public.bounties
  add column if not exists audience text not null default 'students';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'chk_bounties_audience') then
    alter table public.bounties
      add constraint chk_bounties_audience check (audience in ('students', 'staff'));
  end if;
end $$;

create index if not exists idx_bounties_audience
  on public.bounties (organization_id, audience, status);

-- ── 5. Staff archiving ───────────────────────────────────────────────────────
-- is_active already drives directory visibility; archived_at records WHEN and
-- separates "archived on purpose" from "profile row never activated".
alter table public.sis_staff_profiles
  add column if not exists archived_at timestamptz;

alter table public.sis_staff_profiles
  add column if not exists archived_by uuid references public.users(id) on delete set null;
