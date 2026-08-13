-- Port of the OSH (OurSchoolHangout) registration flow into Optio's iCreate funnel.
-- Source inventory: docs/icreate/osh-registration-inventory.md
--
-- 1. Student safety/profile fields captured at registration (staff-visible in the
--    SIS student modal): preferred_name, gender, allergies, medications.
-- 2. Emergency contacts gain a pickup-permission flag (OSH "Allowed To Pickup").
-- 3. icreate_registrations gains answers (special needs / payment intent / media
--    consent) + an emergency_contacts snapshot, and a new 'details' funnel step
--    (account -> details -> paperwork -> fee -> completed).
-- 4. Per-org config gains a questions array and rich paperwork bodies, seeded
--    verbatim from the OSH form for the iCreate org.

alter table public.users
  add column if not exists preferred_name text,
  add column if not exists gender text,
  add column if not exists allergies text,
  add column if not exists medications text;

alter table public.emergency_contacts
  add column if not exists can_pickup boolean not null default false;

alter table public.icreate_registrations
  add column if not exists answers jsonb not null default '{}'::jsonb,
  add column if not exists emergency_contacts jsonb not null default '[]'::jsonb;

alter table public.icreate_registrations drop constraint if exists icreate_registrations_status_check;
alter table public.icreate_registrations
  add constraint icreate_registrations_status_check
  check (status in ('details', 'paperwork', 'fee', 'completed'));
alter table public.icreate_registrations alter column status set default 'details';

-- Seed the OSH-derived content (questions + rich paperwork bodies) into the
-- iCreate config, preserving fee/payment/scheduling values already set.
-- (Full seed applied to prod via MCP 2026-07-01; see the applied migration
-- icreate_registration_osh_port for the verbatim OSH question/paperwork text.)
