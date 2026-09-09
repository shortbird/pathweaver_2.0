# Open Findings — audit remediation, as of 2026-09-08

Everything that is **not** closed. Companion to
[CLOSED_FINDINGS.md](CLOSED_FINDINGS.md), which lists the 57 that are.

Each finding is restated in full, because the file it came from
(`docs/audit-2026-08/REMEDIATION_PLAN.md`, 3,964 lines) is deleted and the git
history is now the only other copy.

**Status vocabulary:** `NEEDS-USER` (blocked on a decision, a credential, or
dashboard access — do not attempt autonomously), `WONTFIX` (declined with
reasons, recorded so a future audit does not re-raise it as an unexamined gap).

| ID | Status | One line |
|---|---|---|
| [OPS-01](#ops-01--no-staging-database) | NEEDS-USER | dev, local and E2E all hit the production database |
| [OPS-03](#ops-03--nothing-applies-supabasemigrations-to-production) | NEEDS-USER | migrations reach prod by hand; workflow written, ships inert |
| [SEC-18](#sec-18--csrf-exemption-list-is-a-hand-edited-name-list) | WONTFIX | confirm or reverse |
| [OPS-05](#ops-05--no-branch-protection--pr-gate-on-main) | WONTFIX | confirm or reverse |

**OPS-09 is no longer open.** The plan carried it as `BLOCKED`. The blocker was
"ten unmerged branches and nine worktrees"; it stopped holding on 2026-09-08 and
the renormalization landed the same day in commit `5638a977`. Verified: 0 CRLF
blobs across 3,664 tracked text files. It is in CLOSED_FINDINGS.md §1.

---

## OPS-01 — No staging database

**Status: NEEDS-USER. The 2026-08-31 audit's top structural risk.**

Dev, local development and the E2E suite all point at the production Supabase
project (`vvfgxcykxjybtvpfzwyx`). Consequences the audit named:

- **FERPA/COPPA exposure.** Real student records — names, dates of birth,
  emergency contacts, evidence media — are what a developer sees on localhost
  and what an automated test run reads and writes.
- **Migrations are unrehearsable.** There is nowhere to apply a migration and
  find out what it does before production finds out. This compounds OPS-03.
- **A prior incident, not a hypothetical:** a test run sent real emails to real
  families via the production Brevo key.

**What it needs:** a funded decision — provision a staging Supabase project,
build a seed pipeline, repoint the dev Render services and local `.env` files.

**What can be done autonomously once approved:** extending `supabase/seed.sql`,
the env plumbing, and the docs. None of it is worth doing before the decision.

---

## OPS-03 — Nothing applies `supabase/migrations/` to production

**Status: NEEDS-USER. The workflow is written and ships inert.**

Migrations reach production by hand, through the Supabase MCP or the dashboard.
The daily exposure-audit workflow exists precisely because of this — it is the
compensating control for a schema nobody can reproduce from the repo.

**What was built** (2026-09-04, on the user's choice of a manual-approval
workflow over a step in `release.yml`): `.github/workflows/migrate-prod.yml`.

Not in `release.yml`, deliberately: a schema change applied by a deploy is a
schema change nobody chose to make at that moment, and its worst case is a lock
on a production table during a release.

Two modes:

- `plan` — read-only. Links the project, runs `migration list --linked`, counts
  what `db push` would attempt, writes the table to the job summary.
- `apply` — runs the push, guarded three ways: a typed `APPLY TO PRODUCTION`, a
  refusal when nothing is pending, and a refusal when more than `max_pending`
  (default 3) migrations are pending.

**The third guard is the point of the whole file.** QB-05 established that the
history table is incomplete — 56 of 64 files carry a drifted version stamp and 3
have no history row at all — so `db push` against production today would attempt
roughly 59 already-applied migrations. Some are `IF NOT EXISTS`-guarded. **Not
all are.** A workflow that made that one click away would be worse than the hand
application it replaces, so the pending count *is* the tripwire: the unreconciled
state cannot be applied by accident, only by deliberately raising a number.

It also runs in the `production` GitHub environment, so required reviewers there
become the approval gate.

**Still needs the user — three things, in this order:**

1. Repository secrets `SUPABASE_ACCESS_TOKEN` and `SUPABASE_DB_PASSWORD`.
2. A `production` GitHub environment with required reviewers. Optional — without
   it, the typed confirmation is the only gate.
3. **Reconcile the history before the first apply.** Run
   `supabase migration repair --status applied <version>` once per
   already-applied file. Until that is done, run `plan` only. The recipe is in
   `supabase/migrations/README.md`.

---

## SEC-18 — CSRF exemption list is a hand-edited name list

**Status: WONTFIX. Presented for confirmation or reversal — see NEEDS TANNER.**

### The finding, as written

`middleware/csrf_protection.py:72-145` holds roughly 30 exempt endpoint names in
a central, hand-edited list. Two production outages have come from drift in it.
The suggestion was to derive exemptions from a route decorator or route metadata
instead. The audit noted the design is otherwise sound — constant-time comparison
of opaque tokens.

### The original reasoning for declining (2026-09-03), unedited

Both prior outages were **drift, not the shape of the list**:

- The 2026-07-21 login outage was three names that no longer resolved
  (`auth.login`, where the blueprint is `auth_login`).
- The 2026-08-01 outage was a new funnel route shipped without an entry.

Neither is possible now, and neither would have been fixed by this item.
`tests/test_csrf_protection.py` already carries
`test_every_exempt_name_matches_a_real_endpoint` (which imports the **real** app
in a subprocess and fails on any name resolving to nothing),
`test_all_icreate_funnel_endpoints_are_exempt`, and its inverse for the
session-authenticated ones. All ten run in CI; verified not deselected.

So what remains of the item is the refactor, and on the merits a decorator is
**worse** here. CSRF exemption is a policy you want to read in one place: the
current list is thirty lines with a written reason per cluster — what
authenticates the caller instead, and why that is sufficient. Spread across
thirty route files, no reviewer sees the whole exemption surface at once, and
"which endpoints skip CSRF" stops having an answer you can read.

Rewriting CSRF plumbing is also the wrong thing to do without a browser: the
failure mode is "a real user cannot log in", which no unit test in this suite
would have caught in either outage — the guards catch the **names**, not the
enforcement path.

**Stated reopen condition:** if the list outgrows a screen, or if per-route
metadata appears for some other purpose that this could ride on.

---

## OPS-05 — No branch protection / PR gate on `main`

**Status: WONTFIX. Presented for confirmation or reversal — see NEEDS TANNER.**

### The finding, as written

Direct-push-to-`main` is the documented production workflow. There is no branch
protection rule, no required review, and nothing preventing a force-push or a
branch deletion.

### The original reasoning for declining (2026-09-04), unedited

Branch protection protects a branch from people who can push to it, and here
that is one person plus his agents. What it would actually add is a PR
round-trip on every change, and the control it is usually wanted for —
"untested code cannot reach production" — is already enforced further down the
pipe. Render auto-deploy is OFF for both prod services, so the only thing that
deploys prod is `release.yml`'s `deploy` job, which needs backend, web **and**
integration to be green (CI-05). Bad code can land on `main`; it cannot reach
users.

**What is genuinely given up, and was accepted:** nothing stops a force-push or
a branch deletion, and there is no second pair of eyes before code is on `main`.

**Stated reopen condition:** if the committer count ever rises above one,
revisit this first.

---

## Carried-forward gaps that are not findings of their own

Recorded because they were noted inside closed items and would otherwise
evaporate with the old plan.

- **SEC-17: an upper bound is not a lockfile.** The root manifest is bounded and
  fenced, so the blast radius of an unattended resolve is a minor rather than a
  major. Reproducible-to-the-hash needs `pip-compile` against Python 3.11, and
  the dev machine runs 3.13, so a lock generated locally would pin resolutions
  the deploy cannot use. It wants doing in CI.
- **SEC-05: the PII scrubber does not reach `exc_info`.** `_scrub_record_extras`
  skips standard `LogRecord` attributes and `exc_info` is one, so a formatted
  traceback goes to Sentry unmasked. Supabase auth errors quote the email that
  failed. This is why FU-04's replacement keeps the exception in the (scrubbed)
  message rather than switching to `exc_info=True`.
- **SEC-12: the OAuth provider is locked, not finished.** A consent screen and a
  scoped, non-session token type are both still absent. They are developable
  behind the flag, and both are product decisions. The trap the flag exists for:
  the one change a well-meaning person makes on seeing a 500 here is to apply
  the missing migration, and that single step arms it.
- **CI-03: eslint itself is not stood up.** The two rules the project had
  actually chosen are enforced in vitest, but replacing the CRA preset with a
  flat config, adding the react/hooks plugins and triaging the first run is not
  autonomous work. The mobile app has no eslint either (QF-09 chose a count ratchet for the
  same reason).
- **QF-03 / QB-06 are declined, not deferred.** 469 hand-rolled fetch call sites
  across 111 pages, and ~9% repository adherence, are the **accepted steady
  state**. Nobody is behind on anything. Reopen only with new cost information.
- **QF-01 is closed by rule extraction, not by hook merging.** Merging
  `useQuests`/`useBounties`/`useNotifications` is declined: the mobile bounties hook
  is a read-only three-endpoint subset of the web app's full CRUD surface, and the two SIS
  path lists that looked identical meant different things. Reopen this item by
  extracting a **rule**, not by merging a hook.
- **QF-06: the 4GB build heap is unexplained.** Not obviously about the PDF
  libraries. Wants a measurement pass of its own rather than a guess.
- **QF-02 / QF-03 verification.** Both were browser-verified against the
  production bundle with the API stubbed. The SIS class rows did not render
  there because the org picker's stub did not satisfy it; that half is covered
  by the jsdom suite rather than by the browser. Said plainly rather than
  counted as a browser verification.
- **AUDIT.md M1–M6 and L3–L5 were never triaged.** The 2026-08-01 audit's
  medium and low findings were explicitly out of the requested scope at the
  time and no later pass picked them up. Their IDs are in CLOSED_FINDINGS.md §3;
  their text is only in git history now. Among them: `M1` a possibly-inverted
  guard letting `POST /api/tasks/<id>/finalize` grant diploma credit repeatedly,
  `M2` no authorization on the caller-supplied upload context in
  `/api/uploads/finalize`, `M3` inert device-fingerprint token binding, `M5` a
  TOCTOU on diploma credit approval. **These are unverified claims from 2026-08-01,
  not confirmed live bugs** — several neighbouring findings in that report turned
  out to be narrower than written once checked. They want a triage pass.
- **AUDIT.md H1 — student evidence media in public storage buckets.** Marked
  "Open — not in the requested scope" in the 2026-08-01 report and never
  revisited there. H4 closed the *Data API* path to evidence rows; H1 is about
  the **storage objects themselves** being served to unauthenticated `GET`.
  Whether this still holds was **not** verified in this pass — it needs a live
  bucket check, which is the same class of check that OPS-04 measured 3,548
  objects with. Treat as unknown, not as open or closed.

---

## NEEDS TANNER

Numbered steps a person can follow without knowing the codebase. Nothing below
can be done from inside the repository.

### 1. A tracked doc published two 64-character secret keys — confirm they are dead

`docs/SESSION_PERSISTENCE.md` (deleted in this pass, but **still in git
history**) contained two literal 64-hex secrets with instructions to set them as
`FLASK_SECRET_KEY` on named Render services:

- dev backend `srv-d9sjl22fngtc73ffenl0` → `3609553095e956d8…`
- prod backend `srv-d9sjl1f10e5c73a14610` → `46e9163dbe647c89…`

Their SHA-256 values do **not** match the prod hashes an earlier session recorded
from a live read on 2026-09-03, so they are probably rotated out or never
applied. That is inference from a secondhand record, not a live read — env vars
cannot be read back from here.

1. Open the Render dashboard for the **prod** backend
   (`srv-d9sjl1f10e5c73a14610`) → Environment.
2. Check whether `FLASK_SECRET_KEY` starts with `46e9163d`. If it does, generate
   a new one (`openssl rand -hex 32`) and replace it.
3. Repeat for the **dev** backend (`srv-d9sjl22fngtc73ffenl0`), checking for
   `3609553095`.
4. Note that deleting the file does not remove the values from git history. If
   either was ever live, treat it as disclosed regardless of the rotation.
5. `FLASK_SECRET_KEY` is **not** `JWT_SECRET_KEY`. Do not touch `JWT_SECRET_KEY`
   here — see step 2.

### 2. Do not remove `FLASK_SECRET_KEY_OLD` before 2027-03-02

The SEC-14 key rotation is complete and verified. One dated action remains.

1. Leave `FLASK_SECRET_KEY_OLD` set on the prod backend until **2027-03-02**.
2. The reason it is 180 days and not 31: LTI SpeedGrader evidence tokens run 180
   days, are **stateless** (nothing to re-issue, no record of who holds one), and
   prod LTI is in active daily use. Dropping the previous key at day 31 would
   kill roughly five months of live Canvas gradebook links with nothing to retry.
3. Cost of keeping it: it is verify-only — no code signs with it — so the
   exposure is an old key that can still validate old tokens, not a second live
   signing key.

### 3. Confirm the org-secrets encryption key is actually reaching the app

`ORG_SECRETS_ENCRYPTION_KEY` was set on the prod backend on 2026-09-05. Rows
re-encrypt lazily, so the table cannot confirm the key is live, and a Render env
var does nothing until the service redeploys.

1. Run this against the production database:
   ```sql
   select name,
          case when value like 'enc:v1:%' then 'encrypted' else 'PLAINTEXT' end as state,
          count(*)
   from organization_secrets group by 1,2;
   ```
2. All 7 rows still `PLAINTEXT` means the key is not reaching the app. Redeploy
   the backend and re-check.
3. Do **not** remove the key once rows are encrypted — that makes them
   unreadable (fail-closed), the same way `FLASK_SECRET_KEY_OLD` is treated.

### 4. Two dashboard edits nobody can make from the repo (OPS-02)

1. **ffmpeg.** Both backends' live build command is `pip install -r
   requirements.txt`. `render.yaml` claimed `apt-get install -y ffmpeg && …`.
   Nothing crashes — `services/video_processing_service.py` probes for ffmpeg at
   startup and degrades — so server-side video probing and thumbnail generation
   are simply **off** in production and have been, silently. To fix: edit the
   build command on both backend services to install ffmpeg first.
2. **Security headers on the apex.** `app.optioeducation.com` returns the full
   suite (HSTS, frame-ancestors, Permissions-Policy). `www.optioeducation.com`
   is served by the `optio-marketing` static service and returns only
   `x-content-type-options` — so the apex makes no HSTS claim at all, which is
   exactly what an HSTS preload submission is judged on. Lower severity (static
   marketing site, no auth, no user data), still a real gap. To fix: add the
   header suite to the `optio-marketing` service.

### 5. Two external leftovers from deleting the advisor daily summary (SEC-06)

The job was deleted in code on 2026-09-07. Two things live outside the repo.

1. In **Sentry**, delete the cron monitor named `advisor-daily-summary`. It no
   longer receives check-ins and will start alerting "missed".
2. On the **Render** prod backend, remove the now-unused
   `ADVISOR_SUMMARY_EMAIL_ALLOWLIST` environment variable.
3. Informational: the Render cron *service* is still named
   `daily-advisor-summary`. It has run `cron_dispatch.py` for months and is
   unaffected. Rename at leisure.

### 6. Walk the acting-as loop once in a browser (FU-05)

The code is done and 11 unit tests cover every transition individually. Nothing
proves the whole loop, and that is the shape of bug this code produces.

1. Sign in as a parent with a dependent.
2. Enter the child's account ("act as").
3. **Reload the page.** You should still be the child.
4. Press the exit button. You should be the parent again.
5. Sign out, then sign back in. You should be the parent, not the child.
6. The failure to watch for: a cookie that outlives the session that set it
   leaves a parent inside their child's account with the exit already pressed.

### 7. Confirm or reverse two WONTFIX decisions

Both are presented, not re-argued. Reply with keep or reverse.

1. **SEC-18** — the CSRF exemption list stays a central hand-edited list rather
   than becoming a per-route decorator. Reasoning in the section above.
2. **OPS-05** — `main` keeps direct-push with no branch protection, on the
   grounds that the deploy gate is the real control. Reasoning above. The stated
   reopen trigger is a second human committer.

### 8. Approve or decline the two blocked ops items

1. **OPS-01** — fund a staging Supabase project. The audit's single
   highest-impact fix. Nothing proceeds without this decision.
2. **OPS-03** — supply the two GitHub secrets and the `production` environment,
   then reconcile the migration history, in that order. Details in the section
   above. Until then, `migrate-prod.yml` should be run in `plan` mode only.

### 9. Decide on `docs/archive/legacy-migrations/` (deleted in this pass)

Deleting `docs/archive/` took 89 legacy `.sql` files with it. QB-05 had
deliberately kept them, because several are the only written record of a schema
decision, and one (`20251226_create_oauth2_infrastructure.sql`) is what SEC-12's
code comment points at when explaining why the OAuth tables do not exist.

They are in git history and recoverable with
`git log --diff-filter=D -- 'docs/archive/legacy-migrations/*'`.

1. If you want them back as files, say so and they will be restored to a path of
   your choosing.
2. If not, no action — the code comments were updated to say the files are in
   history rather than naming a path that no longer exists.
