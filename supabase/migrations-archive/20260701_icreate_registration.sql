-- iCreate parent registration funnel
--
-- Backs the branded multi-step parent onboarding (parent + kids account creation
-- -> paperwork acknowledgements -> record-only registration fee -> external
-- scheduling handoff). iCreate-only; other orgs keep the standard invitation flow.
--
-- Per-registration progress + the (legal) paperwork acknowledgements live in a new
-- table. Per-org config (fee, payment URL, scheduling URL, paperwork items) lives
-- in organizations.feature_flags.icreate_registration so iCreate admins can edit it
-- from SIS Settings without a migration.

create table if not exists public.icreate_registrations (
  id                     uuid primary key default gen_random_uuid(),
  organization_id        uuid not null references public.organizations(id) on delete cascade,
  parent_user_id         uuid not null references public.users(id) on delete cascade,
  -- Opaque token returned to the browser so the (not-yet-verified) parent can drive
  -- the remaining funnel steps without an authenticated session.
  access_token           text not null,
  status                 text not null default 'paperwork'
                           check (status in ('paperwork', 'fee', 'completed')),
  kids                   jsonb not null default '[]'::jsonb,       -- [{user_id,name,dob,type,email}]
  paperwork              jsonb not null default '[]'::jsonb,       -- [{key,label,signed_name,acknowledged_at}]
  fee_cents              integer,
  fee_recorded_at        timestamptz,
  scheduling_emailed_at  timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  completed_at           timestamptz
);

create index if not exists idx_icreate_registrations_org
  on public.icreate_registrations(organization_id);
create index if not exists idx_icreate_registrations_parent
  on public.icreate_registrations(parent_user_id);

-- Backend reaches this table only via the service-role admin client (which bypasses
-- RLS). No anon/authenticated policies are defined, so it is not exposed through the
-- Data API -- consistent with the project's "frontends don't use PostgREST for data"
-- model. See memory: project_postgrest_rpc_not_used.
alter table public.icreate_registrations enable row level security;

-- Seed the iCreate org's registration config (editable later in SIS Settings).
-- Only sets it if absent, so re-running never clobbers admin edits.
update public.organizations
set feature_flags = coalesce(feature_flags, '{}'::jsonb) || jsonb_build_object(
  'icreate_registration', jsonb_build_object(
    'enabled', true,
    -- fee_mode: 'flat' (per family) | 'per_student' | 'lesser' (per-student capped at family)
    'fee_mode', 'lesser',
    'registration_fee_cents', 12500,   -- $125 per-family cap
    'per_student_fee_cents', 5000,     -- $50 per student
    'payment_url', '',
    'scheduling_url', '',
    'paperwork', jsonb_build_array(
      jsonb_build_object('key', 'enrollment_agreement', 'label', 'Enrollment Agreement', 'doc_url', ''),
      jsonb_build_object('key', 'media_release',        'label', 'Photo & Media Release', 'doc_url', '')
    )
  )
)
where slug = 'icreate'
  and not (coalesce(feature_flags, '{}'::jsonb) ? 'icreate_registration');
