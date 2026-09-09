# supabase/baseline

A point-in-time reconstruction of the production schema. **Not migrations.**

## Do not move these files into `supabase/migrations/`

That is where the baseline was first committed, and it broke the integration
suite within the hour. `supabase start` replays the whole migrations directory
onto an empty database, so the 72 incremental files built the schema and then the
baseline tried to create everything a second time:

```
ERROR: type "collaboration_status" already exists (SQLSTATE 42710)
```

A migrations directory holding two complete descriptions of the same schema
cannot be replayed by anything — not `supabase start`, not `db push`, not a
staging rebuild. The baseline is a **replacement** for those 72 files, not an
addition to them. Until someone decides to actually retire them, it lives here.

## What it is for

1. **Reading.** It is the only single-file answer to "what does production
   actually look like".
2. **Standing up a fresh project** — staging, when that happens.
3. **Diffing.** The generator is deterministic, so regenerating and diffing shows
   what changed in production since.

It has never been applied to production and must not be. Production already has
every object in it.

## Regenerating

```bash
SUPABASE_PAT=... python3 scripts/dump_prod_schema.py \
  > supabase/baseline/<timestamp>_baseline_<date>.sql
```

Read the script's docstring for what it captures, what it deliberately omits
(Supabase-managed schemas, data, roles), and why it reads the catalogs over the
Management API instead of using `pg_dump`.

## If you want to retire the 72 incremental files

That is the real squash, and it is probably right eventually. It needs a
decision, and note that deleting files from `supabase/migrations/` carries the
same Perch hazard as renaming them — see the warning in
[../migrations/README.md](../migrations/README.md).

Full reasoning: [docs/remediation-2026-09/MIGRATION_RECONCILIATION.md](../../docs/remediation-2026-09/MIGRATION_RECONCILIATION.md).
