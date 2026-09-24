-- Canarytoken alerts file tickets (2026-09-23).
--
-- Fake AWS keys (canarytokens.org) are planted in backend/.env, the Render
-- prod env and a honey database row. Using one alerts, and the alert POSTs to
-- /api/webhooks/canary, which opens an urgent row here.
--
-- 'canary' is a sixth source, not a reuse of 'sentry': the console labels by
-- source, and a possible breach must not read as an application error.
--
-- Hand-applied to prod and staging on 2026-09-23; this file carries the
-- version both recorded, so migrate-prod sees nothing pending.

alter table public.bug_reports
  drop constraint if exists bug_reports_source_check;

alter table public.bug_reports
  add constraint bug_reports_source_check
    check (source in ('mobile', 'web', 'perch', 'hq', 'sentry', 'canary'));

comment on column public.bug_reports.source is
  'Who filed it: mobile (shake sheet), web (staff reporter), perch (imported 2026-09-14), hq (by hand), sentry (issue alert webhook), canary (canarytoken alert webhook).';
