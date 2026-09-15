-- Sentry alerts file tickets (2026-09-15).
--
-- Every issue alert on the three Optio Sentry projects (optio-backend,
-- optio-web, optio-mobile) now POSTs to /api/webhooks/sentry, which opens a
-- row here so a production error sits in the same queue as a user report.
-- Perch did the same for its own projects through a Supabase edge function;
-- this is the Optio equivalent, on the Flask side, where the ticket tracker
-- already lives.
--
-- 'sentry' is a fifth source, not a reuse of 'hq': the console filters and
-- labels by source, and "filed by hand" would be a lie for a machine.
--
-- One ticket per Sentry issue while it is open. The webhook looks the issue up
-- by extra->>'sentry_issue_id' before it inserts, so that lookup gets an index
-- scoped to the rows that can carry the key.

alter table public.bug_reports
  drop constraint if exists bug_reports_source_check;

alter table public.bug_reports
  add constraint bug_reports_source_check
    check (source in ('mobile', 'web', 'perch', 'hq', 'sentry'));

create index if not exists idx_bug_reports_sentry_issue
  on public.bug_reports ((extra->>'sentry_issue_id'))
  where source = 'sentry';

comment on column public.bug_reports.source is
  'Who filed it: mobile (shake sheet), web (staff reporter), perch (imported 2026-09-14), hq (by hand), sentry (issue alert webhook).';
