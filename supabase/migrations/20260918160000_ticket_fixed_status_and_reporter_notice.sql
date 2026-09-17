-- A ticket is done when the fix is live, and the reporter hears about it.
--
-- Until now `resolved` was written at commit time, by whoever was at the
-- keyboard, and the step the reporter actually cares about -- it is live,
-- here is how to see it -- had no owner once that person left. On 2026-09-17
-- the queue held 20 tickets in `fixing` that a session had started and never
-- returned to. The 2026-09-14 decision that the tracker notifies nobody is
-- reversed here, deliberately: the tracker now tells the reporter once, when
-- the fix is on production, and never before.
--
-- `fixed` is a sixth status: committed, not yet live. The release pipeline
-- (release.yml -> POST /api/bug-reports/internal/deploy-sweep) moves a ticket
-- from `fixed` to `resolved` when the commit in `fix_commit` is in the history
-- of what production is serving, and the reporter's mail goes out on that
-- transition. A human or Claude Code writing `resolved` directly still works
-- (an answered question needs no deploy); the cron sends that mail instead.
--
-- Two of the new columns are the reporter's copy: `resolution` already held
-- "what changed" and now has to be written for the reporter, not the log;
-- `verification` is "how to check it". Neither carries the commit -- that is
-- `fix_commit`, so a SHA never lands in a parent's inbox.
--
-- `notify_reporter` defaults true for new rows and is set false on every row
-- already closed, so this migration itself mails nobody about a fix from
-- July. A superadmin can also switch it off on a ticket where a mail would be
-- wrong (a duplicate, a report filed on someone's behalf).

alter table public.bug_reports
  drop constraint if exists bug_reports_status_check;

alter table public.bug_reports
  add constraint bug_reports_status_check
    check (status in ('new', 'triaged', 'fixing', 'fixed', 'resolved', 'wont_fix'));

alter table public.bug_reports
  add column if not exists fix_commit text,
  add column if not exists verification text,
  add column if not exists notify_reporter boolean not null default true,
  add column if not exists deployed_at timestamptz,
  add column if not exists reporter_notified_at timestamptz;

update public.bug_reports
   set notify_reporter = false
 where status in ('resolved', 'wont_fix');

comment on column public.bug_reports.status is
  'new, triaged, fixing: somebody still has to do something. fixed: committed, waiting for production. resolved: live (or needed no deploy). wont_fix: closed without a change.';
comment on column public.bug_reports.fix_commit is
  'Full SHA of the commit that fixes it. The deploy sweep matches this against the history production is serving to move fixed -> resolved. Survives a merge, not a squash or rebase.';
comment on column public.bug_reports.resolution is
  'What changed, written for the reporter: one or two plain sentences, no commit, no file names. Sent to them when the ticket resolves.';
comment on column public.bug_reports.verification is
  'How the reporter can see the fix: where to go and what to expect. Sent with the resolution.';
comment on column public.bug_reports.notify_reporter is
  'Mail the reporter when this resolves. False on everything closed before 2026-09-18, on Sentry tickets by rule, and wherever a superadmin turns it off.';
comment on column public.bug_reports.deployed_at is
  'When the deploy sweep saw fix_commit live on production. Null when the ticket needed no deploy.';
comment on column public.bug_reports.reporter_notified_at is
  'When the resolution mail went to user_email. Null means not sent: suppressed by rule, or still pending.';

-- The deploy sweep reads "every fixed ticket" and "every resolved ticket not
-- yet mailed"; both are small slices of a table that is mostly resolved.
create index if not exists idx_bug_reports_fixed
  on public.bug_reports (status)
  where status = 'fixed';

create index if not exists idx_bug_reports_awaiting_notice
  on public.bug_reports (resolved_at)
  where status = 'resolved' and notify_reporter and reporter_notified_at is null;
