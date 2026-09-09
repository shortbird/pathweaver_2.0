# supabase/migrations

The live migration directory. `backend/migrations/` and root `migrations/` were
archived on 2026-09-03 and removed from the tree on 2026-09-08. They are in git
history: `git log --diff-filter=D -- 'docs/archive/legacy-migrations/*'`.

## These are applied by a pipeline now

`.github/workflows/migrate-prod.yml` applies them. It is `workflow_dispatch`
only and never runs from a deploy: run it in `plan` mode to see what is pending,
then `apply` with the typed confirmation. OPS-03 is closed.

The history was reconciled on 2026-09-09 and the first real `db push` ran the
same day. Before that, everything below described a directory that disagreed
with the database in both directions; that is fixed, and the sections that
described it have been rewritten rather than left to mislead.

**"Is this live?" is now answerable from the history table**:
`SELECT * FROM supabase_migrations.schema_migrations WHERE version = '...'`.
Checking the object itself is still the stronger test.

## The filenames matched the applied versions, once

Re-measured and **reconciled 2026-09-09**. The history table went from 96 rows to
162 (adding a row at each file's own stamp), then to 71 (removing the 91
apply-time twins that had no file), and finally to 73 as `db push` applied the
first real migration.

What the drift was, since the shape recurs whenever anything is applied by hand:
every migration reached this database through the MCP or the SQL editor, and
that stamps the history row at APPLY time while the filename was written earlier
the same day. So one migration sat on both sides under two different versions —
`20260903200000_qualify_tables...sql` was recorded as `20260903202528` — and a
join on version matched almost nothing.

`db push` needs correspondence in **both** directions. Giving every file a row
was half the fix; the other half was deleting the 91 orphan rows that had no
file. The full file-by-file evidence is in
[docs/remediation-2026-09/MIGRATION_RECONCILIATION.md](../../docs/remediation-2026-09/MIGRATION_RECONCILIATION.md),
and the 91 deleted rows were exported first, to
`~/optio-schema_migrations-orphans-20260909.sql`, outside the repo.

### `20260824_admin_platform_metrics_daily.sql` has an 8-digit stamp

This file previously claimed the CLI "recognises a migration by a 14-digit
version, so this file is not part of the sequence at all — it is skipped rather
than applied or tracked."

**That is wrong, and `db push` proved it:**

```
Found local migration files to be inserted before the last migration on remote
database. Rerun the command with --include-all flag to apply these migrations:
supabase/migrations/20260824_admin_platform_metrics_daily.sql
```

The CLI reads `20260824` as a version perfectly well. It only looked invisible
while a separate row (`20260824233745`, the apply-time stamp) happened to cover
the same migration. It now has a history row at its own 8-digit stamp.

Renaming it to 14 digits would be tidier and is still not done — see the rename
warning below.

### Do not "fix" this by renaming the files

Renaming each file to its recorded version is tidier and is the obvious move.
It is also how you would apply 58 migrations to production by accident.

Perch stages a ticket by applying the migration files its PR **introduces** —
`git diff --name-only origin/main...HEAD -- '*supabase/migrations/*.sql'` — to a
database cloned from production, then the same list to production on merge. A
rename reads as a new file. Fifty-eight renames inside a PR read as fifty-eight
new migrations, against a schema that already has them.

A direct push to `main` is invisible to that scan, so renaming is only ever safe
pushed straight to main — which is a landmine to leave for whoever opens the next
PR touching this directory. Repairing the history touches no files, so Perch
never sees it. Prefer the repair.

### The workflow that applies them

[.github/workflows/migrate-prod.yml](../../.github/workflows/migrate-prod.yml)
(OPS-03) is the intended mechanism. It is `workflow_dispatch` only and never
runs from a deploy. Two modes:

- **plan** — read-only. Prints `migration list` and counts what `db push` would
  attempt. Run this first, always; it is also how you see the drift above.
- **apply** — runs `db push`. Refuses unless you type `APPLY TO PRODUCTION`,
  refuses when nothing is pending, and refuses when more than `max_pending`
  (default 3) are pending. `max_pending` stays at 3: with the history
  reconciled, a healthy pending count is 0 or 1, so 3 is a sane ceiling and
  does not need raising. It runs in the `production` GitHub environment — which
  currently has **no required reviewers**, so the typed string is the only gate.

The files were never renamed. Reconciling the history instead touched no file,
which is why Perch never saw it — the reasoning is in the rename warning above,
and it still holds for any future rename.

**One more thing that only running it revealed:** until 2026-09-09 the `pending`
count in that workflow was always `0`, for any input. The `awk` stripped spaces
but not the backticks the CLI wraps every cell in, so `apply` was unreachable
(its first guard refuses when nothing is pending) and the `max_pending` tripwire
— the guard this file used to call the point of the whole thing — was dead code.
If you touch that parser, test it against real `migration list` output.
