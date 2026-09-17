---
name: tickets
description: Work the Optio ticket queue (bug_reports) end to end - find what is open, fix it, write the reporter's note, mark it fixed with the commit, and let the release pipeline resolve it and email the reporter once the fix is live. Use for "/tickets", "what is open", "work the tickets", "close this ticket", or to file one by hand. Replaced Perch on 2026-09-14.
---

# The ticket tracker

Every Optio platform report is a row in `public.bug_reports` on the production
Supabase project (`vvfgxcykxjybtvpfzwyx`). Superadmin sees the same rows at
`/admin/tickets` in the web platform's admin console. There is no other queue:
Perch was retired on 2026-09-14 and its open tickets were imported here with
`source = 'perch'`.

Read and write it over the Supabase MCP (`supabase-pathweaver`, or the
`claude.ai Supabase` connector with that project id). The table is deny-all RLS
and only the service role reaches it, which the MCP is.

## The one idea

**You never finish a ticket. The deploy does.** You write the fix, the commit
SHA, and two sentences for the reporter, and set the status to `fixed`. When
`release.yml` sees that commit live on production it moves the ticket to
`resolved` and emails the reporter your two sentences. If the person who
pushed walks away mid-deploy, nothing is lost: the pipeline does not need them,
and the cron mails the admin inbox about anything that has sat in `fixed` for
more than a day (a red release, a rebased SHA).

So a ticket you have fixed reads `fixed`, not `resolved`, when you are done
with it. Writing `resolved` on a code fix is the mistake this design exists to
prevent: it mails the reporter before the fix is live.

## Vocabulary

| Column | Values | Meaning |
|---|---|---|
| `status` | `new`, `triaged`, `fixing`, `fixed`, `resolved`, `wont_fix` | The first three need a person. `fixed` = committed, waiting for production. `resolved` = live. |
| `type` | `bug`, `feature`, `question`, `tweak` | |
| `priority` | `low`, `normal`, `high`, `urgent` | |
| `source` | `mobile`, `web`, `perch`, `hq`, `sentry` | Shake sheet, web reporter, imported, filed by hand, Sentry alert. |
| `fix_commit` | text | The **full 40-character SHA** of the commit that fixes it. What the deploy sweep matches on. |
| `resolution` | text | **For the reporter.** What changed, one or two plain sentences. No commit, no file names, no jargon. |
| `verification` | text | **For the reporter.** Where to go and what they should see now. |
| `triage_notes` | text | Internal. What you found, what it pairs with, what blocks it. Append, never overwrite. |
| `notify_reporter` | bool | Default true. Set false when a mail would be wrong (see below). Sentry tickets are skipped by rule regardless. |
| `deployed_at`, `reporter_notified_at` | timestamptz | Written by the sweep. Read them; do not set them. |

A `sentry` ticket is opened by `POST /api/webhooks/sentry` when an issue alert
fires on optio-backend, optio-web or optio-mobile. `extra.sentry` carries the
issue link (`web_url`), level, environment, release and the rule that fired;
`extra.sentry_issue_id` is `<project>:<issue id>`. A repeat alert appends a
line to `triage_notes` on the open ticket (including one in `fixed`) instead
of opening another; an alert after the ticket is closed opens a fresh one
that names the old id. Fix the Sentry issue, not the ticket: mark the ticket
`fixed` like any other, and **resolve the Sentry issue too** or it will file
again on the next regression. Sentry tickets never email anyone.

Columns worth reading on a ticket: `title`, `message`, `steps`, `current_route`
(the page), `user_email`, `user_role`, `organization_id` (join `organizations`
for the name), `platform`, `app_version`, and for mobile reports the
diagnostics: `recent_api_calls`, `recent_console_errors`, `breadcrumbs`,
`extra`. A Perch import keeps its old id and comment history in `extra`.

## The `/tickets` sweep

This is the procedure when asked to work the queue. Do it in this order.

### 1. Read the queue

```sql
select b.id, b.title, b.type, b.priority, b.status, b.source, o.name as org,
       b.user_email, b.current_route, b.created_at, b.updated_at,
       left(b.triage_notes, 200) as notes
  from bug_reports b
  left join organizations o on o.id = b.organization_id
 where b.status in ('new', 'triaged', 'fixing')
 order by b.priority = 'urgent' desc, b.priority = 'high' desc, b.created_at;
```

`fixed` is deliberately absent: those are waiting on a deploy, not on you. If
you want to see them, `select id, title, fix_commit, updated_at from
bug_reports where status = 'fixed'`, and check that each SHA is on `main`
(`git branch --contains <sha>`); one that is not was rebased away and needs
its `fix_commit` corrected.

Tickets already in `fixing` were started by an earlier session that did not
finish. Read their `triage_notes` first; do not restart from zero.

### 2. Group before you fix

Read every open ticket before touching any. Several usually share a root
cause (the same page, the same route, the same error). One fix, several
tickets, one commit: every ticket in the group gets the same `fix_commit`.
Put the grouping in `triage_notes` ("Same cause as <id>") so the next reader
sees it.

Present the grouped list to the user with a one-line plan per group before
you start, and let them cut or reorder. Some tickets are not yours to decide
(a feature request that changes product behaviour, anything touching money
or roles).

### 3. Work each ticket

1. `update bug_reports set status = 'fixing' where id = '...';` so the console
   shows it is being worked.
2. Investigate. Write what you learn to `triage_notes` (append).
3. Fix it, with tests, following `ship-feature` or `debug-production` as the
   ticket warrants. Run the affected suites.
4. **Stop for the user's local check (CLAUDE.md rule 1).** Tell them what to
   click at http://localhost:3000 (or the port your worktree's servers use).
   Nothing is committed until they confirm.
5. Commit. Put the ticket id in the message body so `git log --grep <id>`
   finds it. Commit only your own files, named explicitly.
6. Record the fix. `git rev-parse HEAD` is the SHA:

```sql
update bug_reports
   set status       = 'fixed',
       fix_commit   = '<full 40-char sha>',
       resolution   = 'What changed, for the reporter. One or two sentences.',
       verification = 'Where to go and what to expect now.',
       triage_notes = coalesce(triage_notes || E'\n', '') || 'Fixed in <short sha>: <one line for the log>.'
 where id in ('...', '...');
```

Write `resolution` and `verification` as if to the parent or teacher who
filed it, because that is exactly who reads them. Plain, kind, specific.
"The phone column is back in the roster export." "Open Reports, export any
roster, and check the last column." Not "Fixed the CSV serializer in
sis_reports_service.py".

If the fix needs a native mobile build rather than an OTA, say so in
`triage_notes` and set `notify_reporter = false`; the sweep would otherwise
mail the reporter when the OTA publishes, and their app would not have it.

### 4. Tickets that need no deploy

A question you can answer, a data correction made by SQL, a setting changed
in the console: there is no commit, so go straight to `resolved`. The cron
mails the reporter within ten minutes.

```sql
update bug_reports
   set status = 'resolved', resolved_at = now(),
       resolution = 'The answer, or what was corrected.',
       verification = 'What they will see now.'
 where id = '...';
```

### 5. Tickets you are not going to fix

`wont_fix` with the reason in `resolution`. Declined tickets never email the
reporter. A duplicate is `wont_fix` with "Duplicate of <id>" **unless** the
reporter deserves to hear when the original ships: then mark it `fixed` with
the same `fix_commit` and the same two sentences, and they are mailed too.

### 6. Finish the sweep

Report to the user, as a table: ticket id, title, what you did in one line,
how to verify locally, and status. Then say which will email their reporters
once the deploy is live and which already did (the cron ran). If any ticket
is `fixed` with a commit that is not yet on `main` (your worktree branch),
say so: the sweep cannot see it until it is merged with its SHA intact.

Then stop. Whether to push is the user's call, and after the push nothing
needs either of you.

## Filing one by hand

```sql
insert into bug_reports (title, message, type, priority, source, status, user_email, organization_id, current_route)
values ('Short title', 'What the reporter said, verbatim where possible.', 'bug', 'normal', 'hq', 'new',
        'who@reported.it', (select id from organizations where slug = 'icreate'), '/the/page');
```

`title` is required and at most 120 characters. `user_id` may stay null for a
relayed report. Put a real `user_email` on it if that person should hear when
it ships; leave it null if not.

## How the last mile works (so you can debug it)

- `release.yml` `smoke` job, once `api.optioeducation.com/api/health` serves
  the pushed commit and the web deploy is live on Render: POSTs
  `/api/bug-reports/internal/deploy-sweep` with `{sha, commits: [last 2000
  SHAs], surfaces: ["web"]}`. The `ota` job POSTs again with
  `surfaces: ["mobile"]` after the OTA publishes. Mobile-sourced tickets wait
  for the mobile report; every other source resolves on the web report.
- The endpoint (`services/ticket_finalize_service.py`) moves every `fixed`
  ticket whose `fix_commit` is in `commits` to `resolved`, stamps
  `deployed_at`, then mails every resolved ticket that still owes its
  reporter a message and stamps `reporter_notified_at`.
- The cron calls the same endpoint every ten minutes with an empty body (mail
  only) and at 14:00 UTC with `{"nag": true}` (the fixed-but-not-live mail to
  ADMIN_EMAIL).
- The GitHub Actions secret `CRON_SECRET` must equal the backend's. If the
  pipeline logs "CRON_SECRET secret is not set", that is the whole problem.
- Squash-merging or rebasing a branch changes every SHA on it. Merge with a
  merge commit or fast-forward, or update `fix_commit` afterwards.

## Do not

- Do not write `resolved` on a ticket whose fix is a commit. `fixed`.
- Do not put a SHA, a file name or a stack trace in `resolution` or
  `verification`. The reporter reads them.
- Do not set `deployed_at` or `reporter_notified_at` by hand.
- Do not raise `POSTGREST_MAX_ROWS` or count rows in Python; the route uses
  `count='exact'` for a reason (CLAUDE.md).
- Do not email anyone from here. The sweep sends the one mail there is.
- Do not touch the three Perch memory files' conventions; they describe a
  database this repository no longer files into.
