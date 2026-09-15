---
name: tickets
description: Read, triage and resolve Optio platform tickets (bug reports, feature requests, questions) in the bug_reports table. Use when asked what is open, to work a ticket, to mark one done, or to file one by hand. Replaced Perch on 2026-09-14.
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

## Vocabulary

| Column | Values | Meaning |
|---|---|---|
| `status` | `new`, `triaged`, `fixing`, `resolved`, `wont_fix` | The first three are open. |
| `type` | `bug`, `feature`, `question`, `tweak` | |
| `priority` | `low`, `normal`, `high`, `urgent` | |
| `source` | `mobile`, `web`, `perch`, `hq` | Shake sheet, web reporter, imported, filed by hand. |
| `resolution` | text | What was done. Written when a ticket is closed. |
| `triage_notes` | text | Internal notes: what you found, what it pairs with, what blocks it. |

A `sentry` ticket is opened by `POST /api/webhooks/sentry` when an issue alert
fires on optio-backend, optio-web or optio-mobile. `extra.sentry` carries the
issue link (`web_url`), level, environment, release and the rule that fired;
`extra.sentry_issue_id` is `<project>:<issue id>`. A repeat alert appends a
line to `triage_notes` on the open ticket instead of opening another; an alert
after the ticket is closed opens a fresh one that names the old id. Fix the
Sentry issue, not the ticket: resolve the ticket when the fix is on `main`, and
resolve the Sentry issue too or it will file again on the next regression.

Columns worth reading on a ticket: `title`, `message`, `steps`, `current_route`
(the page), `user_email`, `user_role`, `organization_id` (join `organizations`
for the name), `platform`, `app_version`, and for mobile reports the
diagnostics: `recent_api_calls`, `recent_console_errors`, `breadcrumbs`,
`extra`. A Perch import keeps its old id and comment history in `extra`.

## What is open

```sql
select b.id, b.title, b.type, b.priority, b.status, o.name as org,
       b.user_email, b.current_route, b.created_at
  from bug_reports b
  left join organizations o on o.id = b.organization_id
 where b.status in ('new', 'triaged', 'fixing')
 order by b.priority = 'urgent' desc, b.priority = 'high' desc, b.created_at;
```

## Working a ticket

1. Move it to `fixing` when you start, so the console shows it is being
   worked: `update bug_reports set status = 'fixing' where id = '...';`
2. Put what you learn in `triage_notes`. Append; do not overwrite what a
   previous session wrote.
3. When the fix is committed, close it with the resolution. `resolved_at` is
   stamped by the route when the console does it; do it yourself here:

```sql
update bug_reports
   set status = 'resolved',
       resolution = 'What changed, and the commit. One or two sentences.',
       resolved_at = now()
 where id = '...';
```

`wont_fix` is the same write with a reason in `resolution`. A ticket that turns
out to be a duplicate is `wont_fix` with "Duplicate of <id>" as the resolution.

A ticket is resolved when the fix is on `main` or the user has said it is done,
not when the code is written. Do not close on a passing test.

## Filing one by hand

```sql
insert into bug_reports (title, message, type, priority, source, status, user_email, organization_id, current_route)
values ('Short title', 'What the reporter said, verbatim where possible.', 'bug', 'normal', 'hq', 'new',
        'who@reported.it', (select id from organizations where slug = 'icreate'), '/the/page');
```

`title` is required and at most 120 characters. `user_id` may stay null for a
relayed report.

## Do not

- Do not raise `POSTGREST_MAX_ROWS` or count rows in Python; the route uses
  `count='exact'` for a reason (CLAUDE.md).
- Do not email or notify anyone from here. Tracking only, by decision.
- Do not touch the three Perch memory files' conventions; they describe a
  database this repository no longer files into.
