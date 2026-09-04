# supabase/migrations

The live migration directory. `backend/migrations/` and root `migrations/` were
archived on 2026-09-03 — see
[docs/archive/legacy-migrations/](../../docs/archive/legacy-migrations/README.md).

## Nothing applies these automatically

There is no apply step in the release pipeline (OPS-03). Migrations reach
production by hand — `apply_migration` over the Supabase MCP, the SQL editor, or
the CLI — and the file here is the record, not the mechanism.

**So "is this live?" is always a question for the database, never for this
directory.** Check the object the migration changes.

## The filenames do not match the applied versions

Measured 2026-09-03 against `supabase_migrations.schema_migrations`:

- 64 files here, and **56 carry a version stamp that differs from the version
  actually recorded**. Example: `20260903200000_qualify_tables_in_empty_search_path_functions.sql`
  is recorded as `20260903202528`. The stamps drift because hand-application
  timestamps the row at apply time, while the filename was written by hand
  earlier.
- 3 files appear in no history row at all: the baseline
  (`20260812000000_baseline_prod_schema`, which restates a schema that predates
  the current history), plus `20260825120000_hearthwood_hide_pillars` and
  `20260827150000_announcement_board_link`.

Those last two were checked against production and their effects ARE present —
the `announcements.source_announcement_id` column exists and both Hearthwood
orgs carry `hide_pillars: true`. They were applied by hand and never recorded.
So nothing is missing from production; the HISTORY is incomplete.

### What that means in practice

`supabase db push` would try to re-run roughly 59 migrations that are already
applied. Many are `IF NOT EXISTS`-guarded and would be harmless; not all are.
**Do not run `db push` against production** until the history is reconciled.

Reconcile by telling the history what is already true, one line per file:

```bash
supabase migration repair --status applied <version>
```

`<version>` is the recorded version, not always the filename stamp — 56 of
these differ. `supabase migration list --linked` prints both columns.

### The workflow that applies them

[.github/workflows/migrate-prod.yml](../../.github/workflows/migrate-prod.yml)
(OPS-03) is the intended mechanism. It is `workflow_dispatch` only and never
runs from a deploy. Two modes:

- **plan** — read-only. Prints `migration list` and counts what `db push` would
  attempt. Run this first, always; it is also how you see the drift above.
- **apply** — runs `db push`. Refuses unless you type `APPLY TO PRODUCTION`,
  refuses when nothing is pending, and refuses when more than `max_pending`
  (default 3) migrations are pending — which is precisely the unreconciled
  state described above. It runs in the `production` GitHub environment, so
  configuring required reviewers there adds human approval.

The files were deliberately NOT renamed to match. A rename changes nothing in
the database, and tooling that diffs by filename would read 56 renames as 56 new
migrations — trading a quiet inconsistency for a loud one. Reconciling means
inserting the missing history rows and correcting the recorded versions, which
is a change to production state and belongs with OPS-03's decision rather than
ahead of it.
