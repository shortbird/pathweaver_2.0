-- SIS Phase 4 — ordered waitlists with auto-offer (spec §4.7).
--
-- ADDITIVE ONLY. When a Class is full (capacity reached) and waitlist_enabled, a
-- registration produces a waitlist entry instead of an enrollment. Entries are
-- ordered by position; when a seat frees, the lowest-position 'waiting' entry is
-- offered the seat (with an expiry). Accepting an offer creates the real
-- class_enrollments row.
--
-- Org-scoped, RLS-enabled, backend-only (service_role). See SIS_IMPLEMENTATION_PLAN.md (M3).

create table if not exists public.sis_waitlist_entries (
    id               uuid primary key default gen_random_uuid(),
    organization_id  uuid not null references public.organizations(id) on delete cascade,
    class_id         uuid not null references public.org_classes(id) on delete cascade,
    student_user_id  uuid not null references public.users(id) on delete cascade,
    position         integer not null,
    status           text not null default 'waiting'
                       check (status in ('waiting', 'offered', 'accepted', 'expired', 'declined', 'promoted')),
    offered_at       timestamptz,
    offer_expires_at timestamptz,
    created_at       timestamptz not null default now(),
    updated_at       timestamptz not null default now(),
    unique (class_id, student_user_id)
);
create index if not exists idx_sis_waitlist_class on public.sis_waitlist_entries(class_id, position);
create index if not exists idx_sis_waitlist_org on public.sis_waitlist_entries(organization_id);
create index if not exists idx_sis_waitlist_status on public.sis_waitlist_entries(class_id, status);

alter table public.sis_waitlist_entries enable row level security;
