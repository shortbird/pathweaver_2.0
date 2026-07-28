-- Per-class curriculum materials (2026-07-27)
-- Documents (uploaded files) and links a teacher shares with a single SIS class.
-- Enrolled students read them from the class/quest page; the teacher and org
-- admins manage them from the teacher portal's Curriculum tab.
--
-- Same access model as class_discussion_posts: RLS deny-all, all access via the
-- service-role backend, which enforces the per-class participant gate in Python
-- (routes/sis/class_materials.py). No policies by design.

create table if not exists public.class_materials (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  class_id         uuid not null references public.org_classes(id) on delete cascade,
  kind             text not null check (kind in ('file', 'link')),
  title            text not null,
  url              text not null,          -- public file URL, or the external link
  file_path        text,                   -- storage path for uploaded files (null for links)
  created_by       uuid references public.users(id) on delete set null,
  created_at       timestamptz not null default now()
);

create index if not exists idx_class_materials_class
  on public.class_materials (class_id, created_at desc);

alter table public.class_materials enable row level security;
-- Intentionally no policies: deny-all to anon/authenticated. Access is brokered
-- by the backend service role after the per-class participant check.
