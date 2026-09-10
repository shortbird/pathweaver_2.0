# Remediation register

**The only living remediation document in this repository.** Everything open is
here. Everything closed is in [CLOSED_FINDINGS.md](CLOSED_FINDINGS.md) with its
guard named, or listed there as deliberately unguarded. Every mechanical control
is in [RATCHETS.md](RATCHETS.md).

The `PHASE_N_HANDOFF.md` files are historical records of what each phase did.
They are not to be updated, and nothing should be tracked only in one of them —
if an item in a handoff is still open, it is repeated below.

**Last reconciled: 2026-09-10 (end of Phase 5).**

**Status vocabulary.** `NEEDS-USER` — blocked on a decision, a credential or
dashboard access; do not attempt autonomously. `WONTFIX` — declined with
reasons, recorded so a future audit does not re-raise it as an unexamined gap.
`OPEN` — real work nobody is blocked on.

---

## 1. Open findings

| ID | Status | One line |
|---|---|---|
| [OPS-01b](#ops-01b--local-and-e2e-still-read-production) | NEEDS-USER | Staging exists; `backend/.env` and the E2E suite still point at production |
| [SEC-18](#sec-18--csrf-exemption-list-stays-a-central-list) | WONTFIX | Confirm or reverse |
| [OPS-05](#ops-05--main-keeps-direct-push-with-no-branch-protection) | WONTFIX | Confirm or reverse |
| [BUG-1](#bug-1--eight-referenceerrors-in-the-web-app) | OPEN | Eight `no-undef` findings, one of which throws on every caller |
| [BUG-2](#bug-2--33-app-layer-queries-against-dropped-tables) | OPEN | 33 calls to tables production does not have |
| [BUG-3](#bug-3--rls-findings-from-the-integration-suite) | OPEN | Four findings, asserted in tests, not fixed |
| [GAP-1](#gap-1--the-carried-forward-gaps) | OPEN | Nine smaller gaps noted inside closed items |

### OPS-01b — local and E2E still read production

**Status: NEEDS-USER. The dev half is closed** (see CLOSED_FINDINGS §1b).

Staging project `kltoyqefmcgolbplplsa` exists, is seeded with synthetic data at
production scale, and all three dev Render services read it. A developer on dev
no longer sees real student records.

Still open:

- `backend/.env` (local development) points at production.
- `mobile-e2e.yml` (the E2E suite) points at production. Deferred deliberately
  so an E2E failure could not be confused with a baseline failure.
- Dev still carries production Brevo, Stripe and Gemini keys. Staging fixed the
  database and nothing else. **A prior incident, not a hypothetical: a test run
  once sent real emails to real families through the production Brevo key.**

Runbook: [STAGING_RUNBOOK.md](STAGING_RUNBOOK.md).

### SEC-18 — CSRF exemption list stays a central list

**Status: WONTFIX, presented for confirmation.**

`middleware/csrf_protection.py` holds ~30 exempt endpoint names in a central,
hand-edited list. Two production outages came from drift in it. The audit
suggested deriving exemptions from a route decorator instead.

Both outages were **drift, not the shape of the list** — three names that no
longer resolved (2026-07-21 login outage), and a new funnel route shipped
without an entry (2026-08-01). Neither is possible now:
`test_csrf_protection.py` imports the real app in a subprocess and fails on any
name resolving to nothing, and asserts the funnel and session-authenticated sets
in both directions.

On the merits a decorator is worse here. CSRF exemption is policy you want to
read in one place; the current list is thirty lines with a written reason per
cluster. Spread across thirty route files, "which endpoints skip CSRF" stops
having an answer anyone can read. Rewriting CSRF plumbing is also the wrong
thing to do without a browser: the failure mode is "a real user cannot log in",
which no unit test in this suite would have caught in either outage.

**Reopen if:** the list outgrows a screen, or per-route metadata appears for
some other purpose that this could ride on.

### OPS-05 — `main` keeps direct-push with no branch protection

**Status: WONTFIX, presented for confirmation.**

There is no branch protection rule on `main`, no required review, and nothing
preventing a force-push or a branch deletion.

Branch protection protects a branch from people who can push to it, and here
that is one person plus their agents. What it would add is a PR round-trip on
every change; the control it is usually wanted for — untested code cannot reach
production — is already enforced further down. Render auto-deploy is OFF for
both prod services, so the only thing that deploys prod is `release.yml`'s
`deploy` job, which needs backend, web and integration green.

**What is genuinely given up, and was accepted:** nothing stops a force-push or
a branch deletion, and there is no second pair of eyes before code is on `main`.
Phase 5 narrowed the first half: `guard_bash.py` now stops a force-push and a
push to `main` for confirmation. That is an agent-side gate, not a server-side
one — it protects against accident, not against intent.

**Reopen if:** the committer count ever rises above one.

### BUG-1 — eight ReferenceErrors in the web app

Found by ESLint's first run (Phase 3), reported rather than fixed. Each is an
identifier read at runtime and never bound.

| File | Undefined | Effect |
|---|---|---|
| `web/src/utils/animations.js` | `React` (10 sites) | **No React import at all.** `useScrollAnimation` calls `React.useState`; every caller throws |
| `web/src/components/ui/PhilosophyCard.jsx` | `Heart`, `TrendingUp`, `Clock` | Icons referenced with no import |
| `web/src/components/admin/ServiceInquiries.jsx` | `Clock`, `Mail`, `CheckCircle` | Same |
| `web/src/components/demo/ConversionPanel.jsx` | `formatPrice` (3 sites) | Helper never imported or defined |
| `web/src/components/diploma/DiplomaHeader.jsx` | `text`, `primary` (3 pairs) | Destructured names not in scope |
| `web/src/components/diploma/DiplomaStats.jsx` | `text`, `primary` | Same |
| `web/src/components/diploma/SkillsBreakdown.jsx` | `text`, `primary`, `pillarInfo` | Same |
| `web/src/pages/SchoolPage.jsx` | — | **9 duplicate object keys `module`**; all but the last silently discarded |

Two lower-severity: a sparse array from a stray comma in
`web/src/components/sis/tasks/AssignedWork.jsx:194`, and
`window.location.href` assigned to itself in
`web/src/components/FixQuestCompletion.jsx:26` (may be a deliberate reload idiom).

To see them: `cd web && npx eslint src --rule '{"no-undef":"error"}' --format stylish | grep "is not defined"`.

### BUG-2 — 33 app-layer queries against dropped tables

Found in Phase 5. Eleven tables that are absent from the production catalog
(verified against `information_schema` on 2026-09-10) are still queried by app
code. Each call is either a 500 waiting for its route to be reached, or dead
code on a route nobody reaches — which of the two is a per-site question.

| Table | App-layer calls | Where |
|---|---|---|
| `parent_connection_requests` | 8 | `repositories/parent_repository.py` |
| `observer_requests` | 5 | `routes/observer_requests.py` |
| `promo_codes` | 4 | `routes/auth/registration.py`, `routes/auth/google_oauth.py` |
| `quest_tasks` | 3 | `routes/student_ai_assistance.py`, `services/credit_mapping_service.py` |
| `task_merges` | 3 | `routes/credit_dashboard/{merge,items}.py` |
| `ai_generation_metrics` | 3 | `services/ai_quest_review_service.py` |
| `friendships` | 2 | `repositories/user_repository.py` |
| `user_quest_deadlines` | 2 | `routes/parent/{quests_view,evidence_view}.py` |
| `task_merge_sources`, `ai_prompt_versions`, `quest_template_task_flags` | 1 each | — |

Nine more in `backend/scripts/`. Ratcheted by
`test_dropped_tables_are_not_queried.py`, which stops the number growing and
prints the list.

Worth doing as its own bugfix pass: for each site, decide whether the feature is
dead (delete the route) or the table was renamed (repoint it). The observer and
parent-connection clusters look like whole features that were removed at the
database and left in the code.

### BUG-3 — RLS findings from the integration suite

Found in Phase 4 by executing the RLS suite rather than reading the schema.
Asserted in tests, not fixed.

1. **No `users` row can be updated through the Data API**, including a user
   editing their own. `generate_slug_trigger` fires BEFORE INSERT OR UPDATE and
   is not `SECURITY DEFINER`. Not an incident — every application write to
   `users` goes through Flask on the service-role client — but it means RLS on
   that table is not what it appears to be. Three candidate fixes exist.
2. **The completions policy has no organization scope.**
3. **`user_skill_xp` is RLS-enabled with zero policies.**
4. **`diplomas` has INSERT and UPDATE policies and no SELECT policy at all.**

### GAP-1 — the carried-forward gaps

Recorded because they were noted inside closed items and would otherwise
evaporate.

- **SEC-17: an upper bound is not a lockfile.** Reproducible-to-the-hash needs
  `pip-compile` against Python 3.11; the dev machine runs 3.13, so a lock
  generated locally would pin resolutions the deploy cannot use. It wants doing
  in CI.
- **SEC-05: the PII scrubber does not reach `exc_info`.** A formatted traceback
  goes to Sentry unmasked, and Supabase auth errors quote the email that failed.
- **SEC-12: the OAuth provider is locked, not finished.** A consent screen and a
  scoped, non-session token type are both absent. The trap the flag exists for:
  the obvious response to a 500 here is to apply the missing migration, and that
  single step arms it.
- **QF-06: the 4GB build heap is unexplained.** Not obviously about the PDF
  libraries. Wants a measurement pass of its own.
- **The repo root `package.json` declares three unused dependencies** and a
  `playwright test` script with no config. Nothing audits it in CI — see NEEDS
  TANNER item 8.
- **`npm run lint:fix` would clear ~205 unused-import errors** across ~200 files.
  Not run, because the brief was to ratchet rather than to fix. See NEEDS TANNER
  item 7.
- **AUDIT.md M1–M6 and L3–L5 were never triaged.** Among them: `M1` a
  possibly-inverted guard letting `POST /api/tasks/<id>/finalize` grant diploma
  credit repeatedly, `M2` no authorization on the caller-supplied upload context
  in `/api/uploads/finalize`, `M3` inert device-fingerprint token binding, `M5` a
  TOCTOU on diploma credit approval. **These are unverified claims from
  2026-08-01, not confirmed live bugs** — several neighbouring findings turned
  out narrower than written once checked. They want a triage pass.
- **AUDIT.md H1 — student evidence media in public storage buckets.** H4 closed
  the Data API path to evidence rows; H1 is about the **storage objects
  themselves** being served to unauthenticated `GET`. Never revisited. Needs a
  live bucket check. Treat as unknown, not as open or closed.
- **`docs/archive/legacy-migrations/` was deleted** with 89 legacy `.sql` files,
  several of which are the only written record of a schema decision. Recoverable
  with `git log --diff-filter=D -- 'docs/archive/legacy-migrations/*'`. See
  NEEDS TANNER item 10.

---

## 2. What closed during phases 0 through 5

Each moved into [CLOSED_FINDINGS.md](CLOSED_FINDINGS.md) with a guard named, or
is listed there as unguarded with the reason. Summarised here so the register
shows the whole arc.

| Phase | Closed | Guard |
|---|---|---|
| 0 | The 3,964-line plan replaced by CLOSED/OPEN; 45 stale docs identified | `TestDocsDoNotRotBack` |
| 1 | `frontend/` → `web/`, `frontend-v2/` → `mobile/`; the v1/v2 naming | Render dashboards updated 2026-09-09; build commands match |
| 2 | OPS-03 migration history reconciled; `db push` ran end to end | `migrate-prod.yml` `max_pending`; [MIGRATION_RECONCILIATION.md](MIGRATION_RECONCILIATION.md) |
| 2 | OPS-01 (dev half) staging project built and dev repointed | Env vars on the three dev services |
| 2 (shared) | The mis-keyed `user_skill_xp` rows; the transcript vocabulary's eight copies | CHECK constraint `20260909205019`; `@shared/credits` conformance tests |
| 3 | CI-03 eslint stood up; TypeScript at the API boundary; import cycles; react-query; npm audit at the root of both apps; OPS-09 line endings | `eslintRatchet`, `apiBoundaryIsTypeScript`, `importCycles`, `lintRules`, `audit-gate.mjs`, `test_line_endings_stay_lf` |
| 3 | The seven "closed but unguarded" findings that could be guarded | `test_closed_findings_stay_closed.py` (19 tests) |
| 4 | RLS exercised against a real database; five untested high-churn files; coverage floors raised to measured | `tests/integration/test_rls_org_isolation.py`; `ci.yml`/`release.yml`; `mobile/jest.config.js` |
| 5 | Rules 3, 5, 6, 7, 8, 9, 11, 12, the CSRF body rule, the dropped-table list and the `is_org_admin` rule left prose and became hooks or tests | [RATCHETS.md](RATCHETS.md) §1, §2, §4 |
| 5 | Sentry MCP reachable — the auth scheme was `Sentry-Bearer`, not `Bearer` | `.mcp.json`; [docs/MCP_SETUP.md](../MCP_SETUP.md) |

---

## NEEDS TANNER

Numbered steps a person can follow without knowing the codebase. Nothing below
can be done from inside the repository. Items completed in earlier phases have
been removed; what remains is everything still outstanding as of 2026-09-10.

### 1. Confirm two published secrets are dead

`docs/SESSION_PERSISTENCE.md` (deleted, but **still in git history**) contained
two literal 64-hex secrets with instructions to set them as `FLASK_SECRET_KEY`:

- dev backend `srv-d9sjl22fngtc73ffenl0` → `3609553095e956d8…`
- prod backend `srv-d9sjl1f10e5c73a14610` → `46e9163dbe647c89…`

Their SHA-256 values do not match the prod hashes recorded from a live read on
2026-09-03, so they are probably rotated out. That is inference from a
secondhand record, not a live read.

1. Open the Render dashboard for the **prod** backend → Environment.
2. If `FLASK_SECRET_KEY` starts with `46e9163d`, generate a new one
   (`openssl rand -hex 32`) and replace it.
3. Repeat for the **dev** backend, checking for `3609553095`.
4. Deleting the file does not remove the values from git history. If either was
   ever live, treat it as disclosed regardless of rotation.
5. `FLASK_SECRET_KEY` is **not** `JWT_SECRET_KEY`. Do not touch the latter here.

### 2. Do not remove `FLASK_SECRET_KEY_OLD` before 2027-03-02

1. Leave it set on the prod backend until that date.
2. Why 180 days and not 31: LTI SpeedGrader evidence tokens run 180 days, are
   stateless (nothing to re-issue, no record of who holds one), and prod LTI is
   in daily use. Dropping the previous key at day 31 would kill roughly five
   months of live Canvas gradebook links with nothing to retry.
3. Cost of keeping it: it is verify-only. No code signs with it.

### 3. Confirm the org-secrets encryption key reaches the app

`ORG_SECRETS_ENCRYPTION_KEY` was set on the prod backend on 2026-09-05. Rows
re-encrypt lazily, so the table cannot confirm the key is live, and a Render env
var does nothing until the service redeploys.

1. Run against production:
   ```sql
   select name,
          case when value like 'enc:v1:%' then 'encrypted' else 'PLAINTEXT' end as state,
          count(*)
   from organization_secrets group by 1,2;
   ```
2. All 7 rows still `PLAINTEXT` means the key is not reaching the app. Redeploy
   the backend and re-check.
3. Do **not** remove the key once rows are encrypted — that makes them
   unreadable, fail-closed.

### 4. Two Render dashboard edits (OPS-02)

1. **ffmpeg.** Both backends' live build command is
   `pip install -r requirements.txt`; `render.yaml` claimed an apt-get step.
   Nothing crashes — `services/video_processing_service.py` probes at startup
   and degrades — so server-side video probing and thumbnail generation are
   simply **off** in production, and have been silently. Fix: edit the build
   command on both backend services to install ffmpeg first.
2. **Security headers on the apex.** `app.optioeducation.com` returns the full
   suite. `www.optioeducation.com` is served by `optio-marketing` and returns
   only `x-content-type-options`, so the apex makes no HSTS claim — which is
   exactly what an HSTS preload submission is judged on. Fix: add the header
   suite to the `optio-marketing` service.

### 5. Two leftovers from deleting the advisor daily summary

1. In **Sentry**, delete the cron monitor named `advisor-daily-summary`. It no
   longer receives check-ins and will start alerting "missed".
2. On the **Render** prod backend, remove the unused
   `ADVISOR_SUMMARY_EMAIL_ALLOWLIST` environment variable.
3. Informational: the Render cron *service* is still named
   `daily-advisor-summary`. It runs `cron_dispatch.py` and is unaffected.

### 6. Walk the acting-as loop once in a browser

The code is done and 11 unit tests cover every transition individually. Nothing
proves the whole loop, and that is the shape of bug this code produces.

1. Sign in as a parent with a dependent.
2. Enter the child's account ("act as").
3. **Reload the page.** You should still be the child.
4. Press exit. You should be the parent again.
5. Sign out, then back in. You should be the parent, not the child.
6. The failure to watch for: a cookie that outlives the session that set it
   leaves a parent inside their child's account with the exit already pressed.

### 7. Get the real backend coverage number, then ratchet it

The backend floor is 41 and is probably far too low. It cannot be measured from
this machine: a local pytest run loads `backend/.env` and the CI runner does
not, and the two disagree by about 15 points.

1. Open the most recent `Backend Tests` job on GitHub Actions.
2. In "Run tests with coverage", read the `TOTAL` percentage.
3. Report it, and the floor gets set to one point under it in **both**
   `ci.yml` and `release.yml` — they must match.

### 8. Three small decisions

1. **`npm run lint:fix`** clears ~205 unused-import errors across ~200 files.
   If you want it run, say so; `ERROR_BASELINE` in `eslintRatchet.test.js` drops
   to whatever `npm run lint` then reports, in its own commit.
2. **Audit the repo-root `package.json` in CI?** It had three high advisories,
   including one where jws improperly verifies HMAC signatures. They are fixed,
   but nothing stops them coming back. The cost is a second `npm ci` on every
   web CI run for a package that ships nothing.
3. **Should the FERPA public notice render on `/portfolio/:slug`?**
   `optioeducation.com/portfolio/emma-ruiz` and
   `optioeducation.com/public/diploma/<uuid>` show the same student's page, and
   only the second carries the "this portfolio is public, consent given on
   <date>" banner. The slug URL is the prettier one and the one people share.
   One-line change, but it changes what a public page displays.

### 9. Confirm or reverse two WONTFIX decisions

Both are presented, not re-argued. Reply keep or reverse.

1. **SEC-18** — the CSRF exemption list stays central rather than becoming a
   per-route decorator.
2. **OPS-05** — `main` keeps direct-push with no branch protection.

### 10. Decide about the deleted legacy migrations

Deleting `docs/archive/` took 89 legacy `.sql` files with it. Several are the
only written record of a schema decision, and one
(`20251226_create_oauth2_infrastructure.sql`) is what SEC-12's code comment
points at when explaining why the OAuth tables do not exist.

1. If you want them back as files, say so and they are restored to a path of
   your choosing.
2. If not, no action. The code comments already say the files are in history
   rather than naming a path that no longer exists.

### 11. Remove the stale `sentry-optio` MCP entry

Phase 5 added a working Sentry server to `.mcp.json`. The broken user-scope
entry is still in `~/.claude.json` and will keep failing at every session start
next to the working one.

1. Run `claude mcp remove sentry-optio` (or delete the `sentry-optio` block
   from the `projects` section of `~/.claude.json`).
2. Confirm `SENTRY_AUTH_TOKEN` is exported from `~/.zshrc`. The project entry
   reads it.
3. Start a session and check that `sentry` connects. The auth scheme is
   `Sentry-Bearer`; that one word is what was wrong for weeks.
