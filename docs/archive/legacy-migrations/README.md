# Legacy migration directories

Two directories that used to sit at `backend/migrations/` (80 files) and
`migrations/` (8 files). Moved here 2026-09-03 (QB-05). **Neither has ever been
part of the current migration flow**, and nothing reads them.

`supabase/migrations/` is the live directory. See its README for what is and is
not applied.

## Provenance

| Directory | Was | Naming |
|---|---|---|
| `backend-migrations/` | The pre-Supabase-CLI flow: hand-run SQL, applied through the dashboard or a one-off script | Four conventions in one folder — `NNN_name.sql`, `YYYYMMDD_name.sql`, bare `name.sql`, and two `.py` runners |
| `root-migrations/` | Older still; three numbered files plus their unnumbered originals and two READMEs | `NNN_name.sql` alongside duplicate `name.sql` |

## Why they are kept rather than deleted

Several are the only written record of a schema decision — `deprecated/README.md`
is cited from `services/credit_mapping_service.py`, and
`20251226_create_oauth2_infrastructure.sql` is the file SEC-12's comment points
at when it explains why the OAuth provider tables do not exist in production.

## Two runner scripts were deleted, not moved

`backend/scripts/apply_ai_review_migration.py` and `run_ai_jobs_migration.py`
applied `009_ai_quest_review_system.sql` and `add_ai_jobs_tables.sql`. Both
create tables the platform has since DROPPED — `ai_quest_review_queue`,
`ai_generation_metrics`, `ai_prompt_versions`, `quality_action_logs` — all of
which CLAUDE.md lists under "Deleted Tables (Don't Query)". A script whose only
effect is to recreate a dropped table is worse than no script, so they went.
The SQL they ran is still here.
