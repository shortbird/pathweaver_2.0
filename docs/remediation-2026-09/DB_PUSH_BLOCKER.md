# `supabase db push` still refuses — the reconciliation was half the job

**Status: needs a decision. Nothing further has been written to production.**
Date: 2026-09-09, after the reconciliation in
[MIGRATION_RECONCILIATION.md](MIGRATION_RECONCILIATION.md).

---

## What I got wrong

I said the 66-row reconciliation would make `supabase db push` see a clean state
and that `apply` would then work. It does not, and I claimed it without being
able to test it — the only verification that mattered needed
`SUPABASE_DB_PASSWORD`, which did not exist until an hour after I wrote the
claim.

The reconciliation made every **file** have a history row. It did nothing about
the reverse: history rows with no file. `db push` requires correspondence in
**both** directions, and refuses on the first thing it finds missing:

```
Remote migration versions not found in local migrations directory.
Make sure your local git repo is up-to-date. If the error persists, try repairing
the migration history table:
supabase migration repair --status reverted 20260714000000 20260715171539 ... (91 versions)
```

**This is not a regression.** All 91 orphans predate today — none was written by
the reconcile, verified by `created_by`. `db push` would have hit the same wall
before any of this work. But the goal was a working pipeline, and it is not
working.

**What the 66 rows did buy:** the pending count is now meaningful, and `plan`
correctly reports **1**. That is real and it is what exposed the parser bug in
`migrate-prod.yml` (which returned 0 for any input, and is now fixed).

## The shape of the problem

Every hand-applied migration exists in the history under a stamp minutes to hours
later than its filename, because hand-application stamps the row at apply time.
So one migration now appears twice:

| | Version | Has a file? |
|---|---|---|
| What actually ran | `20260903202528` | no — **orphan** |
| What I added | `20260903200000` | yes, `20260903200000_qualify_tables_in_empty_search_path_functions.sql` |

Current state: **162 history rows, 72 files.** 71 rows correspond to a file (5
were already exact, 66 I added). The other **91 are orphans**:

| Group | Count | Notes |
|---|---:|---|
| Pre-baseline (`≤ 20260811`) | 26 | 24 have an archived file in `migrations-archive/`; 2 do not |
| Post-baseline drifted originals | 65 | No file anywhere — these are the "what actually ran" twins |
| **All 91** | | **carry recoverable SQL in `statements`** |

Among the 65 is `20260814183451 security_audit_revoke_trigger_fn_from_public` —
the one migration production has that the repo never did. Its history row is its
only written record apart from the ACL it produced, which the baseline now
captures.

---

## The options

### A. Mark the 91 reverted — the CLI's own suggestion

`supabase migration repair --status reverted <91 versions>`, which **deletes**
those rows. History becomes 71 rows, exactly matching the directory, and
`db push` works.

- **Cost:** erases the record of what ran and when. The `statements` column is
  the only machine-readable copy of the SQL for the 2 pre-baseline rows with no
  archived file, and for `20260814183451`.
- **Mitigation:** export all 91 rows' SQL to a file first. Cheap, and I already
  have the extraction working.
- **Reversible?** Only from that export. There is no undo.

### B. Rename the 72 files to their recorded versions

Makes the 64 drifted rows stop being orphans.

- **Does not solve it.** The 26 pre-baseline orphans remain, so `db push` still
  refuses. It would *also* require deleting the 66 rows I just added, which would
  become orphans in turn.
- Carries the Perch hazard: Perch applies the migration files a PR introduces,
  and 72 renames read as 72 new migrations. See
  [supabase/migrations/README.md](../../supabase/migrations/README.md).
- **Strictly worse than A.**

### C. `supabase db pull`

Generates local files matching the remote versions.

- Creates 91 new files describing schema the existing 72 already describe. The
  integration suite replays the whole directory onto an empty database, so this
  reproduces exactly the failure the baseline caused this morning.
- **Rejected.**

### D. Accept that `db push` is not the mechanism

Keep `plan` for visibility; keep applying migrations by hand through the MCP or
the SQL editor, as today.

- Zero risk, zero benefit. It is the status quo that OPS-03 exists to end.

### E. Squash properly — the architecturally correct end state

Move the 72 files to `migrations-archive/`, revert all history, and make
`supabase/baseline/…sql` the single migration in `supabase/migrations/`, with
future migrations layered on top. Directory and history then agree by
construction, and the integration suite replays baseline-then-forward, which
works.

- This is what the baseline was generated *for*, and it is where this should end
  up.
- **But not yet.** The baseline has never been proven to build a database from
  empty — there is nowhere to try it, which is OPS-01. Committing to it as the
  only description of the schema before anything has successfully run it is a bet
  on an untested 10,208-line file.

---

## Recommendation

**A now, E after staging exists.**

A is the minimal change that makes `db push` work, and it is the only option that
does. Do it with the export taken first, so the `statements` content survives in
a file rather than only in a table we are about to delete from.

E is the right destination, and the thing that makes it safe is a staging project
that has actually been built from the baseline. That is OPS-01, still unfunded.
Doing E first would mean deleting the incremental history *and* the incremental
files on the strength of a file nothing has ever executed.

## What A would involve

1. Export all 91 rows (`version`, `name`, `statements`) to a file outside the
   repo — the same treatment the `backup_schema` rows got, since these are a
   historical record rather than something to carry in git.
2. Write the `DELETE`, and its rollback that restores from the export.
3. Run it, then `plan` — expect **1 pending**, unchanged.
4. Then `apply`, which finally runs the schema-drop migration.

Steps 1 and 2 are safe to prepare without a decision. **Step 3 is the write and
needs your explicit go-ahead**, the same as the reconciliation did.
