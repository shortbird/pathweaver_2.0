-- A quest a teacher gave one student, outside any class.
--
-- Microschools teach one child at a time as often as they teach a class, and
-- the console only knew the class: a teacher put students in a class, then
-- assigned quests to the class. The office could already give a library quest
-- to a student by name (POST /api/sis/quests/<id>/students), but that wrote
-- only the enrollment, so nothing remembered who gave it, when it was due, or
-- that it was teacher-assigned at all -- the submissions inbox and the
-- teacher's views key off class_quests and never saw that work.
--
-- One row per (student, quest): the assignment. The enrollment it causes is
-- the ordinary user_quests row (services/class_quest_enrollment), so the quest
-- reads like any other in the student's account. This row outlives a restart
-- of that enrollment, which is why it is not a column on user_quests.
--
-- Written only by services/student_quest_assignments.py.

create table if not exists public.student_quest_assignments (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  student_id       uuid not null references public.users(id) on delete cascade,
  quest_id         uuid not null references public.quests(id) on delete cascade,
  assigned_by      uuid references public.users(id) on delete set null,
  due_date         timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint student_quest_assignments_one_per_quest unique (student_id, quest_id)
);

create index if not exists student_quest_assignments_org_idx
  on public.student_quest_assignments (organization_id);
create index if not exists student_quest_assignments_assigned_by_idx
  on public.student_quest_assignments (assigned_by);
create index if not exists student_quest_assignments_quest_idx
  on public.student_quest_assignments (quest_id);

comment on table public.student_quest_assignments is
  'A quest a teacher assigned to one student outside any class, with its due date. Enrollment is the ordinary user_quests row; this records the assignment. Written by services/student_quest_assignments.py.';

-- Deny-all: only the service role (the Flask backend) reads or writes it.
-- No policies is the policy.
alter table public.student_quest_assignments enable row level security;
