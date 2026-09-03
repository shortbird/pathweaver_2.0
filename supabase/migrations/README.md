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

The files were deliberately NOT renamed to match. A rename changes nothing in
the database, and tooling that diffs by filename would read 56 renames as 56 new
migrations — trading a quiet inconsistency for a loud one. Reconciling means
inserting the missing history rows and correcting the recorded versions, which
is a change to production state and belongs with OPS-03's decision rather than
ahead of it.
