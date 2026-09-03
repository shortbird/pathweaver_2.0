# Integration tests

These run against a **throwaway local Supabase stack** — real Postgres, real
PostgREST, real GoTrue — booted by
[tests-integration.yml](../../../.github/workflows/tests-integration.yml) on
every PR. It is free, it is destroyed with the runner, and it holds no
production data.

## Status

**All ten files are ported. 133 integration tests run on every PR, enforcing.**
(Counts verified against the CI run of 2026-09-02: `133 passed, 4382 deselected`.)

| File | Tests | Covers |
|---|---|---|
| `test_auth_flow.py` | 21 | Login, registration, CSRF, token refresh, admin boundary |
| `test_parental_consent.py` | 22 | COPPA: token hashing, single use, replay, admin review |
| `test_observer.py` | 19 | FERPA-adjacent: per-student link scoping, comment permissions |
| `test_dependents.py` | 18 | Parent-child ownership, promotion, acting-as |
| `test_quest_invitations.py` | 11 | Per-student invitation ownership, accept/decline |
| `test_parent_dashboard.py` | 10 | Cross-account exposure on the parent surfaces |
| `test_announcements.py` | 9 | Cross-organization isolation |
| `test_api_endpoints.py` | 9 | Health, quest listing, anonymous-access sweep |
| `test_quest_completion.py` | 8 | XP ledger: correct pillar, no double-award |
| `test_curriculum.py` | 8 + 3 skipped | iframe/markdown sanitisation (pure functions, no DB) |

`test_curriculum.py` no longer requires a database — it was always testing pure
functions and had been sitting behind `requires_db`, so it had not run at all.
It now runs in the ordinary backend suite on every push.

## What was wrong with the originals

Three independent defects, each fatal on its own:

**1. They called an RPC that has never existed.** 158 call sites did
`test_supabase.rpc('execute_sql', {'query': ...})`. There is no `execute_sql`
function in production, in the schema baseline, or in the migration history —
confirmed against `pg_proc`.

**2. They seeded a schema the app never reads.** Fixtures inserted into
`test_schema.users` and tried to redirect reads with an `X-Supabase-Schema`
header. PostgREST reads `Accept-Profile` / `Content-Profile`, so the header was
ignored and the app kept reading `public`. Seed and read were never pointed at
the same place.

**3. They authenticated in a way the app does not recognise.** Every test did
`session['user_id'] = ...`, but `require_auth`
([utils/auth/decorators.py:78](../../utils/auth/decorators.py#L78)) resolves the
caller through `session_manager`, which reads Bearer tokens and httpOnly
cookies and never looks at Flask's session.

On top of that, most assertions were vacuous —
`assert response.status_code in [200, 401]` passes whichever happens, and eight
of `test_auth_flow.py`'s thirteen tests were that shape.

## What the port bought immediately

The first time these tests were ever able to run, they caught a live production
bug: `routes/parental_consent/requests.py` called `generate_consent_token()` and
`hash_token()` at four sites without importing either. Every request to
`/api/parental-consent/send`, `/verify`, and `/resend` died with
`NameError` → HTTP 500. **The entire COPPA parental-consent flow was broken in
production**, and no unit test could see it because the module imports fine; only
calling the endpoint reveals it.

## Porting a file

The stack is disposable, so isolation gymnastics are unnecessary: use `public`,
seed through the ordinary client, and let the fixtures reset between tests.

The fixtures (in [../conftest.py](../conftest.py)):

| Fixture | Gives you |
|---|---|
| `db` | Service-role client, guarded to refuse any non-local host |
| `make_user(role=..., **fields)` | Real `auth.users` + `public.users` row; returns `id`/`email`/`password` |
| `student`, `parent` | Shorthand for `make_user` with that role |
| `auth_headers_for(user_id)` | `Authorization: Bearer <real token>` — the genuine verification path |
| `make_quest(**fields)` | An active quest row |
| `_reset_db` | Autouse; truncates between tests (no-op for tests that don't use `db`) |

Rules learned the hard way:

- **Seed via the client** (`db.table('users').insert(...)`), never raw SQL strings.
- **Authenticate with `auth_headers_for`.** Bearer also bypasses CSRF by design,
  so there are no CSRF tokens to juggle.
- **`public.users.id` is FK'd to `auth.users(id)`**, so a bare insert into
  `public.users` violates the constraint. `make_user` creates both.
- **Patch outbound email/Brevo.** The suite-wide `_no_outbound_email` guard fails
  any test that reaches the real Brevo account — see `no_brevo_sync` in
  `test_auth_flow.py` and `no_consent_email` in `test_parental_consent.py`.
- **Assert single values.** `== 403`, not `in (401, 403)`.
- **Add new tables to the truncate list** in both
  [supabase/ci/test_helpers.sql](../../../supabase/ci/test_helpers.sql) and
  `_RESET_TABLES` in `conftest.py`.

Two more fixtures worth knowing: `make_org(name=...)` for the org-scoped
surfaces, and `make_quest` — which sets `quest_type` explicitly on purpose, since
the column DEFAULT (`'custom'`) violates the `check_quest_type` constraint that
only allows optio/course/class.

**Endpoints move.** Several files here tested URLs that no longer exist
(`/api/observers/invite`, `/api/parents/invite`, `/api/curriculum/quests`,
`/api/users/dashboard`). Check the route actually exists before porting a test
for it — `app.url_map` is the fastest source of truth:

```python
python -c "from app import app; print([str(r) for r in app.url_map.iter_rules() if 'quest' in str(r)])"
```

Tests for deleted endpoints were removed rather than rewritten against invented
URLs, with a note in the file recording what went and why.

## Running locally

Needs Docker. On macOS, [colima](https://github.com/abiosoft/colima) works:
`brew install colima docker supabase/tap/supabase && colima start --cpu 4 --memory 8`.

```bash
supabase start

# The baseline is schema-only, so PostgREST 42501s on everything without grants.
DB=$(docker ps --format '{{.Names}}' | grep supabase_db | head -1)
docker exec -i "$DB" psql -U postgres -d postgres < supabase/ci/grants.sql
docker exec -i "$DB" psql -U postgres -d postgres < supabase/ci/test_helpers.sql

eval "$(supabase status -o env | sed \
  -e 's/^API_URL=/export SUPABASE_URL=/' \
  -e 's/^SERVICE_ROLE_KEY=/export SUPABASE_SERVICE_ROLE_KEY=/' \
  -e 's/^ANON_KEY=/export SUPABASE_ANON_KEY=/')"

cd backend && RUN_DB_INTEGRATION_TESTS=1 FLASK_ENV=testing \
  FLASK_SECRET_KEY=test-secret-key-for-ci-only \
  python -m pytest tests/ -m requires_db

supabase stop --no-backup
```

`supabase/config.toml` deliberately sets `enable_confirmations = true` to match
production. With confirmations off, `sign_up` returns a live session that
supabase-py stores on the shared admin client, silently downgrading it from
`service_role` to `authenticated` for the rest of the request — which breaks
registration on an RLS policy and tests a code path production never runs.
