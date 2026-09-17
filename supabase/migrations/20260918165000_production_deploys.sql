-- What production is serving, as the release pipeline last reported it.
--
-- The ticket deploy sweep (services/ticket_finalize_service.py) moves a
-- `fixed` ticket to `resolved` when its commit is in the history production
-- serves. The pipeline tells the backend that history once per release, and
-- until now that was the only moment the comparison could happen: a ticket
-- marked fixed ten minutes AFTER the report, with a commit that was already
-- live, waited for the next release to be noticed. Reconciling a backlog of
-- already-shipped fixes -- twenty of them on 2026-09-17 -- is exactly that
-- case, and so is any push that lands before the agent has written its rows.
--
-- One row per surface, overwritten by each report, so the cron's ten-minute
-- tick can replay the last report and finish whatever became fixed since.
-- Two thousand SHAs is about a year of this repository; a row is ~80KB and
-- there are two of them.

create table if not exists public.production_deploys (
  surface      text primary key check (surface in ('web', 'mobile')),
  sha          text not null,
  commits      text[] not null default '{}',
  reported_at  timestamptz not null default now()
);

comment on table public.production_deploys is
  'The last release report per surface: the commit production serves and the SHAs in its history. Written by POST /api/bug-reports/internal/deploy-sweep from release.yml; replayed by the cron so fixed tickets resolve without waiting for the next push.';

-- Deny-all, like bug_reports: only the service role (the Flask backend)
-- reads or writes it. No policies is the policy.
alter table public.production_deploys enable row level security;
