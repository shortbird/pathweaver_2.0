-- SIS Phase 8 — daily check-in/out + schedule-based reminders + attendance-gap alerts.
--
-- ADDITIVE ONLY. A parent checks their child in at drop-off and out at pickup (or
-- reports a full-day absence). A cron sweep (every ~10 min during school hours)
-- reminds guardians who haven't checked in by a grace period after the day's first
-- class, and alerts org admins + the guardian when a student was present for an
-- earlier class but missing from a later one (per-class teacher attendance).
--
-- Org-scoped, RLS-enabled, backend-only (service_role). See SIS_IMPLEMENTATION_PLAN.md.

-- ── per-org timezone (class times are local; reminders need it) ───────────────
alter table public.organizations
    add column if not exists timezone text not null default 'America/New_York';
-- Per-org SIS settings (grace period, school-hours window) live in feature_flags
-- under the 'sis_settings' key (jsonb) — no schema change needed to tune them.

-- ── sis_checkins: one row per (student, day) ─────────────────────────────────
create table if not exists public.sis_checkins (
    id               uuid primary key default gen_random_uuid(),
    organization_id  uuid not null references public.organizations(id) on delete cascade,
    student_user_id  uuid not null references public.users(id) on delete cascade,
    date             date not null,
    status           text not null default 'checked_in'
                       check (status in ('checked_in', 'checked_out', 'absent')),
    checked_in_at    timestamptz,
    checked_out_at   timestamptz,
    checked_in_by    uuid references public.users(id) on delete set null,
    note             text,
    created_at       timestamptz not null default now(),
    updated_at       timestamptz not null default now(),
    unique (organization_id, student_user_id, date)
);
create index if not exists idx_sis_checkins_org_date on public.sis_checkins(organization_id, date);
create index if not exists idx_sis_checkins_student on public.sis_checkins(student_user_id);

-- ── sis_attendance_alerts: dedupe sweep notifications (one per kind/day) ──────
create table if not exists public.sis_attendance_alerts (
    id               uuid primary key default gen_random_uuid(),
    organization_id  uuid not null references public.organizations(id) on delete cascade,
    student_user_id  uuid not null references public.users(id) on delete cascade,
    date             date not null,
    alert_type       text not null check (alert_type in ('checkin_reminder', 'gap_alert')),
    context          jsonb,
    created_at       timestamptz not null default now(),
    unique (student_user_id, date, alert_type)
);
create index if not exists idx_sis_attendance_alerts_org_date on public.sis_attendance_alerts(organization_id, date);

alter table public.sis_checkins          enable row level security;
alter table public.sis_attendance_alerts enable row level security;
