-- SIS beta feedback (2026-07-09/10):
--  1. Calendar event categories (org-editable list lives in
--     organizations.feature_flags.sis_settings.calendar_categories; each event
--     stores its chosen category label here).
--  2. Family directory per-field privacy: families choose what to share.
--     Email/phone default to true (matches what the directory always showed);
--     address defaults to FALSE because the directory never showed it before —
--     families must explicitly opt in to sharing it.

alter table public.sis_events
  add column if not exists category text;

alter table public.households
  add column if not exists directory_share_email  boolean not null default true,
  add column if not exists directory_share_phone  boolean not null default true,
  add column if not exists directory_share_address boolean not null default false;
