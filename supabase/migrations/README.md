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

Re-measured **2026-09-05** against `supabase_migrations.schema_migrations`:

- **67 files.** 66 are well-named; of those, only **5** have a history row whose
  version equals the filename stamp. **58 carry a drifted stamp** — e.g.
  `20260903200000_qualify_tables_in_empty_search_path_functions.sql` is recorded
  as `20260903202528`. Hand-application timestamps the row at apply time; the
  filename was written by hand earlier.
- **3 files have no history row at all**: the baseline
  (`20260812000000_baseline_prod_schema`, which restates a schema predating the
  current history), `20260825120000_hearthwood_hide_pillars`, and
  `20260827150000_announcement_board_link`. The last two were checked against
  production and their effects ARE present. Nothing is missing from production;
  the HISTORY is incomplete.
- **`20260824_admin_platform_metrics_daily.sql` has an 8-digit stamp**, not 14.
  The CLI recognises a migration by a 14-digit version, so this file is not part
  of the sequence at all — it is skipped rather than applied or tracked. The
  migration itself IS live, recorded as `20260824233745`. Renaming the file to
  that version would make the repo honest; read the Perch warning below first.
- **`security_audit_revoke_trigger_fn_from_public` (`20260814183451`) is applied
  in production with no file here.** The reverse drift, and the one case where
  the repo is missing something the database has.
- 28 history rows have no file. All but the two above are pre-baseline
  (≤ `20260811`) and live in `../migrations-archive/` — expected after the squash.

### What that means in practice

`supabase db push` decides what is pending by comparing the FILE version against
`schema_migrations.version`, so today it would attempt **61 migrations that are
already applied**. Many are `IF NOT EXISTS`-guarded. Not all are.
**Do not run `db push` against production** until the history is reconciled.

[`scripts/reconcile_migration_history.sh`](../../scripts/reconcile_migration_history.sh)
holds the exact list and runs `supabase migration repair --status applied <V>`
for each. It dry-runs by default and needs `--apply` to write. Nothing is
executed against the schema — this is bookkeeping only, and it is the safe half
of OPS-03. It needs the CLI, a `supabase link`, and `SUPABASE_DB_PASSWORD`.

**That list is a measurement, not a constant.** Every migration applied by hand
since 2026-09-05 adds another drifted row. Re-derive with
`supabase migration list --linked` before trusting it.

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
  (default 3) migrations are pending — which is precisely the unreconciled
  state described above. It runs in the `production` GitHub environment, so
  configuring required reviewers there adds human approval.

The files were deliberately NOT renamed to match. A rename changes nothing in
the database, and tooling that diffs by filename would read 56 renames as 56 new
migrations — trading a quiet inconsistency for a loud one. Reconciling means
inserting the missing history rows and correcting the recorded versions, which
is a change to production state and belongs with OPS-03's decision rather than
ahead of it.
