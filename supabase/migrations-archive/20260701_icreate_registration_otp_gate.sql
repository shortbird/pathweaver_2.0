-- Account-first iCreate funnel: parents create (or sign into) their Optio
-- account before seeing the rest of the registration form. New accounts must
-- confirm their email with a 6-digit OTP (generated server-side, sha256-hashed
-- here, emailed via SendGrid) before the funnel issues its access_token.
-- Existing accounts skip the OTP (the password proves ownership) and are
-- attached to the iCreate org automatically.
--
-- Status flow: verify -> family -> details -> paperwork -> fee -> completed.

alter table public.icreate_registrations
  add column if not exists otp_hash text,
  add column if not exists otp_expires_at timestamptz,
  add column if not exists email_verified_at timestamptz;

alter table public.icreate_registrations drop constraint if exists icreate_registrations_status_check;
alter table public.icreate_registrations
  add constraint icreate_registrations_status_check
  check (status in ('verify', 'family', 'details', 'paperwork', 'fee', 'completed'));
alter table public.icreate_registrations alter column status set default 'verify';
