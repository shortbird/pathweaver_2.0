# Closed Findings — audit remediation, as of 2026-09-09

This replaces the 3,964-line `docs/audit-2026-08/REMEDIATION_PLAN.md`, which is
deleted. It is the file an agent should read before touching anything in these
areas, so that completed work does not get undone.

**Read this first:** every line below is a fix that is *in the tree today*. If
you are about to change one of these behaviours, you are probably reopening a
closed finding. Check the guard column before you do.

Sources folded in:

- The **2026-08-31** four-specialist audit → 61 findings (SEC/CI/DOC/QB/QF/OPS/HYG)
  plus 6 follow-ups (FU) found while remediating. 57 are closed.
- The **2026-08-01** external security audit (`AUDIT.md`) → C/H/M/L findings.
  Its critical and high items were closed before the 2026-08-31 audit began.
  Its IDs are cited by ~20 code comments, so its ID map is preserved in
  [§3](#3-the-2026-08-01-audit-ids-cited-by-code-comments) below.

Open items live in [OPEN_FINDINGS.md](OPEN_FINDINGS.md). Both files were verified
against the code on 2026-09-08; the verification method and its limits are in
[§4](#4-how-this-was-verified-and-what-that-does-not-prove).

---

## 1. Closed and guarded

A guard is a test, lint rule or ratchet that fails the build if the fix is
undone. These are the findings that cannot quietly regress.

| ID | Finding | How it was fixed | Guard |
|---|---|---|---|
| SEC-01 | `@require_role('admin')` named a role that does not exist (11 sites) | Sites moved to `@require_superadmin` / `('advisor','superadmin')`; `require_role` now raises `ValueError` at decoration time for any name outside `VALID_ROLES \| VALID_ORG_ROLES` | `tests/unit/test_require_role_names_are_real.py` |
| SEC-02 | Unauthenticated `/api/auth/cookie-debug` disclosed `FLASK_ENV`, cookie config, `FRONTEND_URL` | Endpoint deleted (its one frontend caller was never invoked); `/api/auth/token-health` answers the Safari question with no config in the body | `tests/unit/test_no_config_disclosure_routes.py` — parametrised over retired routes, asserts 404 |
| SEC-03 | Masquerade start/exit returned impersonation tokens in the JSON body to every client | Both endpoints route through `token_delivery`; cookie-capable browsers get cookies only | `tests/test_token_delivery.py` — bypass scan walks all of `routes/`, four credential field names, reasoned allowlist |
| SEC-05 | PII log scrubber existed but was never installed; 34 statements logged raw emails | `install_pii_scrubbing()` in `utils/logger.py` — a LogRecord factory plus a `Logger.makeRecord` wrapper, because Sentry reads records outside every handler's filter chain | `tests/unit/test_log_pii_scrubbing.py` (12 cases, one standing where Sentry stands) |
| SEC-07 | Legacy `verify_token()` accepted refresh tokens as access tokens | Second implementation deleted; it now calls `session_manager.verify_access_token()`, picking up the session-timeout check and previous-key fallback | `tests/unit/test_verify_token_access_only.py` (10 cases, all impersonation token types parametrised) |
| SEC-08 | `get_current_user_id` fell back to cookies after a rejected Bearer; `get_effective_user_id` did not — same request, two answers | Unified on strict semantics. Two de-escalation callers (`/logout`, `/stop-acting-as`) use a named `get_deescalation_user_id()` | `tests/unit/test_auth_resolvers_fail_closed.py` — asserts the three resolvers agree across a credential matrix; a test pins `get_deescalation_user_id` to exactly two call sites |
| SEC-10 | No structural ownership enforcement on id-parameter routes | `@require_relationship_to(param, allow=(...))` in `utils/auth/relationships.py`, composing the existing `portfolio_access` predicates. 217 id-bearing routes accounted for: 172 declare, 26 superadmin-verified, 19 allowlisted with written reasons | `tests/unit/test_id_routes_declare_relationship.py` + `test_require_relationship_to.py`, `test_sis_org_gates.py`, `test_dependents_relationship_gate.py`, `test_transcript_org_scope_gate.py`. Companion tests forbid stale/placeholder allowlist entries |
| SEC-11 | 242 handlers returned raw exception text in 5xx bodies | 240 now `raise` and let `middleware/error_handler` answer (fixed text in prod, detail in dev, Sentry grouping by stack); 2 AI health checks keep 503 with fixed text | `tests/unit/test_no_exception_text_in_5xx.py`. 4xx deliberately not banned — the status code is the line |
| SEC-12 | OAuth provider minted full-privilege session tokens, scope enforced nowhere | `Config.OAUTH_PROVIDER_ENABLED`, default false; the blueprint is **not registered** unless set. Absent beats broken — the tables never existed, so it was returning 500s | `tests/unit/test_oauth_provider_disabled.py` — default off, no rule registered, 404 not 500, Google sign-in unaffected |
| SEC-13 | `test_admin_client_justified` was deselected from CI and matched only assignment lines | Rewritten on AST (1,133 real call sites today, not the ~195 estimated); 84 missing justifications written per module; deselect removed from `tests-backend.yml` | `tests/unit/test_admin_client_justified.py`, plus `test_the_scan_still_finds_call_sites` — a floor of 500 catches "the scan broke" |
| SEC-14 | Prod `JWT_SECRET_KEY` did not match the Supabase JWT secret, so **every** `get_user_client()` query 401'd — no RLS at all | User rotated the key (SEC-14 runbook). Prerequisites shipped first: `utils/jwt_keys.decode_app_jwt` gives three app-signed token types a previous-key fallback, and `POSTGREST_ROLE = 'authenticated'` is now a claim | Guard test bans new hand-rolled `jwt.decode` of app tokens. **Dated action — see OPEN_FINDINGS.md** |
| SEC-15 | FERPA disclosure logging covered only ~5 route modules | `@require_relationship_to(..., discloses='...')` — the gate is the only place that knows *which relationship* let the caller in. Applied to 38 read routes | Tested non-behaviours: `self` never logged, denied callers never logged, opt-in only, logging failure never breaks the read |
| SEC-16 | Org Stripe keys stored application-readable in plaintext | Fernet envelope with an `enc:v1:` prefix keyed on `Config.ORG_SECRETS_ENCRYPTION_KEY`. Unset key is a supported state; rows re-encrypt lazily on read | Failure modes tested: encrypted-row-no-key → `None`, wrong key → `None`, **malformed key → raise** (a typo must not read as "not configured") |
| SEC-17 | 27 unbounded backend deps, no lockfile | Corrected first: those 27 are in `backend/requirements.txt`, which **nothing installs**. The 8 unbounded specs in the ROOT file (what Render and CI install) now carry upper bounds | `tests/unit/test_requirements_are_bounded.py`, with an empty allowlist. A real lock is still open — see OPEN_FINDINGS.md |
| CI-01 | No linter or type-checker in CI | ruff (F/E9/B/S110/S112) and mypy both enforcing in `tests-backend.yml`. mypy had never worked: `mypy.ini`'s `exclude` regex closed at column 0, killing every per-module setting, and `services/` lacked `__init__.py` | Both steps gate PR and release. 296 modules exempted by name; the list only shrinks |
| CI-02 | Layering bleed: ~4,663 direct `.table(` calls | Per-layer ratchet, not a migration | `tests/unit/test_direct_db_calls_do_not_grow.py`. Also asserts the combined `routes/`+`services/` total never grows, so a lateral move down a layer passes |
| CI-03 | `no-console` and a `localStorage` token ban were configured and had **never run** (eslint absent, config extended a CRA preset in a Vite project) | Both rules enforced in vitest, which CI already gates. 34 console calls: 11 deleted, 21 → `logger.debug`, 2 allowlisted in the logger itself | `web/src/__tests__/lintRules.test.js`, with a floor assertion so the scan cannot pass by globbing nothing |
| CI-04 | No dependabot/renovate | `.github/dependabot.yml` — pip (root **and** backend), npm (both apps), github-actions. Minor/patch grouped; majors individual | Config in tree |
| CI-05 | Integration tests did not hold the deploy | `release.yml`'s `deploy` job is `needs: [backend, web, integration]`. Matters because prod ships by direct push, so a merge-only gate gates nothing | Workflow |
| CI-06 | Raw `print()` in app code | Guard armed after QB-03 cleared the call sites; exemptions are per-file with written reasons | `tests/unit/test_no_raw_print_in_app_code.py` |
| QB-02 | 35 copies of `_now`/`_now_iso`, three of them returning **naive** `datetime.utcnow()` | One definition in `utils/timestamps.py`, aliased at each site. The divergence was a real crash: comparing naive against aware raises `TypeError` | `tests/unit/test_one_definition_of_now.py`, plus a **ratchet** on the 449 remaining `datetime.utcnow()` calls |
| QB-04 | God route files (2,149 / 2,006 / 1,718 lines) | All three split. `registration_funnel` went in three stages onto the **same blueprint** via `register_routes(bp)` — its CSRF exemptions are keyed by endpoint name, and a second blueprint would have reproduced the 2026-07-21 login outage. URL maps dumped before/after and proven byte-identical | `tests/unit/test_route_file_sizes.py` — **`EXEMPTIONS` is empty** |
| QB-04b | `('guardian','other')` duplicated 7 times | One `config.constants.GUARDIAN_RELATIONSHIPS`. `'other'` is the member that drifts — the funnel writes it for a grandparent or aunt, and a copy omitting it locks those families out on one screen only | `tests/unit/test_one_definition_of_guardian.py`, matched against whitespace-normalised source |
| QF-01 | v1/v2 duplication | Six cross-app findings, each a **client-side copy of a server-side rule that nothing checked**: pillar colours, HTML-entity decoding, XP guide roles, an upload cap, role resolution, the subject vocabulary. Four were live or one migration from live. `@legal` became `@shared` | `shared/pillars.json`, `shared/roles.ts`, `shared/subjects.json`, `shared/richTextCases.json`, each with a conformance test **per surface**; `sharedAlias.test.ts` asserts all five alias declarations |
| QF-02 | 15 components over 1,000 lines | All 15 split into 31 components. Bodies moved verbatim by script, then a babel scope pass caught six real mistakes | `web/src/__tests__/componentSize.test.js` — **`EXEMPT` is empty**; a fourth test fails when a file comes back under the cap and its exemption lingers |
| QF-03 | Two data-fetching paradigms in v1 | 8 highest-churn pages migrated to `hooks/api/`, which found three duplicate in-flight fetches and one staleness bug invisible to either file alone | `web/src/__tests__/dataFetchingParadigm.test.js` — ratchets **call sites**, not files, so a pure split does not move it |
| QF-04 | v2: dead react-query dep + 6 hand-rolled polling loops | Dependency dropped; `usePolling` centralises the loops with failure backoff (2x to a 10x ceiling). The loops were *already* visibility-aware — what was missing was backoff | Tests pin the `useRef` task holder, so an inline arrow cannot reset the interval phase |
| QF-05 | Silent partial-failure: parallel fetches failing to `console.error`, sections rendering empty | All 13 sites were in `DiplomaPage.jsx`. Per-call catches removed (they converted rejections into fulfilled promises, so `allSettled` saw five successes); `reportSectionFailures` names the failed sections in one toast | Two tests read the page source: no `.catch(err => console.error` shape survives, and every `allSettled` has a matching report call |
| QF-07 | Styling drift | Ratcheted at 293 off-palette hex values, not converted — each is a visual change to a real screen | `web/src/__tests__/brandPalette.test.js` reads the sanctioned palette out of `tailwind.config.js`, so it cannot drift from the design system |
| QF-08 | a11y tooling installed with zero imports | axe wired over 10 shared UI primitives (leverage: they render on nearly every page). Clickable divs ratcheted at the real count, 142 | `web/src/components/ui/__tests__/a11y.test.jsx`. The test says out loud that axe catches maybe a third of real problems |
| QF-09 | v2 explicit `any` | Ratcheted at the real count, 580 (not the 390 estimated) | `mobile/src/__tests__/typeWidening.test.ts` |
| OPS-07 | Superadmin identity hardcoded in 5 source files | Access decisions → `Config.PLATFORM_STAFF_EMAILS`, read at **call** time not import time. Two files published a personal Gmail as the API's public support contact → `Config.SUPPORT_EMAIL` | `tests/unit/test_no_hardcoded_superadmin_identity.py` — also asserts the default list is unchanged, so moving it to config cannot quietly change who is staff |
| OPS-09 | 907 CRLF files, no `.gitattributes` | `.gitattributes` landed 2026-09-07; the one-shot renormalize landed **2026-09-08** in commit `5638a977` (879 files, LF-only). `.git-blame-ignore-revs` carries that SHA | `.gitattributes` `text=auto` normalizes on stage. Verified 2026-09-08: **0 CRLF blobs across 3,664 tracked text files** |
| FU-01 | `registration.py` read `Config` from a scope that may not be bound | Import hoisted to module scope. Reachable on every unexpected failure in ~75 lines of validation — the caller got a 500 from the wrong place and Sentry grouped on the `UnboundLocalError` | `tests/unit/test_lazy_import_not_used_in_handler.py`, proven against the real pre-fix file |
| FU-03 | `bug_reports` was deny-all RLS with 356 rows; superadmin triage returned an empty list, HTTP 200, no error | Triage routes build the repo with an admin client (authorization was never RLS — it is `@require_role('superadmin')` at the route) | Two-part guard: a test that the list route builds the repo with no `user_id`, and a static scan banning `BugReportRepository(user_id=...)` |
| FU-04 | `[DIPLOMA]`/`[DEBUG]` traces at WARNING in hot paths | 11 lines deleted, not demoted — an f-string argument is built before the logger sees it. One logged raw PostgREST rows of a student's completed tasks, at WARNING, on the parent dashboard | `tests/unit/test_no_debug_tagged_logs.py` — the rule is the **tag**, not the level, because the tag is the decidable part |
| FU-05 | Acting-as tokens were body-only, so SEC-03's gate could not apply | `/act-as` sets an httpOnly `acting_as_token` cookie; `session_manager` reads it; the body copy is now gated. Cleared on stop **and** on logout | `tests/unit/test_acting_as_cookie.py`, 11 cases built around the exit, not the leak: a cookie outliving its session leaves a parent inside their child's account with the exit button already pressed |
| FU-06 | An unknown registration code 500'd instead of 404ing | `.single()` → `.limit(1)`. First step of the funnel, unauthenticated — the people hitting it are parents who mistyped their link | Three tests, including an **AST** check that the function does not call `.single()` again (a substring search matches the docstring explaining why) |

---

## 1b. Closed 2026-09-09 — the two operational findings

Both were `NEEDS-USER` for weeks. Neither has an automated guard; the "how you'd
know it regressed" column says what to look at instead.

| ID | Finding | How it was fixed | How you'd know it regressed |
|---|---|---|---|
| OPS-03 | Nothing applied `supabase/migrations/` to production; migrations reached prod by hand, so the directory and `schema_migrations` disagreed in both directions and `db push` refused | Reconciled in two parts: a history row added at each file's own stamp (66 rows), then the 91 apply-time orphan rows deleted (exported first to `~/optio-schema_migrations-orphans-20260909.sql`). Then `migrate-prod.yml` applied a real migration end to end | Run `migrate-prod.yml` in `plan`. A healthy count is 0 or 1. Dozens means the drift is back — read [MIGRATION_RECONCILIATION.md](MIGRATION_RECONCILIATION.md) before applying |
| OPS-01 | Dev, local and E2E all pointed at the production database — real student records on localhost and in automated test runs | Staging project `kltoyqefmcgolbplplsa` created, built from the baseline, seeded with synthetic data at production scale. All three dev Render services repointed | `curl` the dev backend's `SUPABASE_URL`, or check the Render env vars. **Partial** — local `.env` and `mobile-e2e.yml` still point at production |

### What closing these actually turned up

Worth reading, because in every case the artifact had been committed and
described as working, and only executing it disagreed.

- **`migrate-prod.yml`'s pending count returned `0` for any input**, from the day
  the file was written. The `awk` stripped spaces but not the backticks the CLI
  wraps every cell in. `apply` was therefore unreachable (its first guard refuses
  when nothing is pending) and the `max_pending` tripwire — which the file's own
  header called the point of the whole thing — was dead code. The protection was
  real by accident, via the wrong guard, for an unrelated reason.
- **The schema baseline could not build a database.** Committed in the morning as
  "the new source of truth", it failed four times on first execution: sequences
  never emitted, functions ordered before the tables their signatures reference,
  constraints before the functions they call, and `COMMENT ON TABLE` against a
  view. All four existed from the moment it was written.
- **`supabase/migrations/README.md` was wrong about the CLI.** It said an 8-digit
  filename stamp makes a file invisible to the migration sequence. `db push`
  refused to run until that file had a history row.
- **`public.quests.quest_type` defaults to a value its own CHECK rejects** — see
  §2 below. Found by the seed script inserting a quest without specifying it.

## 2. Closed but unguarded

These are fixed, and **nothing fails the build if they are undone.** They are the
ones that can quietly regress. Listed so a reviewer knows where to look by hand.

| ID | Finding | How it was fixed | Why there is no guard |
|---|---|---|---|
| SEC-04 | `.env.example` shipped the production Supabase project ref | Replaced with `your-project-ref` placeholders in `backend/` and `web/` | Never guarded. A one-line test asserting no tracked `.env.example` names `vvfgxcykxjybtvpfzwyx` would close this cheaply. **Verified clean 2026-09-08.** |
| SEC-06 | `daily_advisor_summary` was hard-routed to one personal inbox on a production cron | Superseded: the whole job was **deleted** 2026-09-07 on the user's instruction (the dispatcher had stopped sending it on 2026-08-05). The job, its 951-line service, the cron script, both trigger endpoints, the template and the env var all went | Nothing to guard — the code is gone. Two external leftovers are in OPEN_FINDINGS.md |
| SEC-14b | Prod key rotation state | `FLASK_SECRET_KEY_OLD` set and confirmed by the user 2026-09-03 | A live env var cannot be asserted from the repo. **Dated action in OPEN_FINDINGS.md** |
| SEC-16b | Prod encryption key | `ORG_SECRETS_ENCRYPTION_KEY` set 2026-09-05; rows re-encrypt lazily, so the table cannot confirm the key is live | Follow-up query in OPEN_FINDINGS.md |
| DOC-01 | `REPOSITORY_MIGRATION_STATUS.md` claimed "✅ MIGRATION COMPLETE" at ~9% adherence | Rewritten with counts from the tree (267 route files, 32 touching a repository, 196 making direct calls); records that the debt is *fenced* by CI-02 | Prose. Nothing detects a doc going stale again |
| DOC-02 | Integration-test status drift across **five** artifacts, all understating | Corrected against the CI run of 2026-09-02 (133 passed, enforcing). The most harmful was CLAUDE.md's "advisory and red on purpose" — an engineer would have dismissed a real failure. The dead advisory branch in `tests-integration.yml` was removed | Prose |
| DOC-03 | `LOCAL_DEVELOPMENT.md` was linked twice and did not exist | Created, carrying what is only learned by hitting it (no reloader, the exact test env, Node 25 breaking v1 vitest, the CRLF trap). All CLAUDE.md links swept | Prose |
| DOC-04 | CLAUDE.md self-contradicted on commit scope | The "stage and commit ALL outstanding changes" text is gone; Rule 12 stands alone | Prose. This one matters: the old text was actively dangerous with several agents in one tree |
| DOC-05 | ~20 planning docs cluttered the repo root | 16 moved; root is down to four `.md` files, all of which CLAUDE.md links or is | Prose |
| QB-01 | Dead `exceptions.py` (549 lines, a second parallel exception hierarchy) | Verified zero importers and no dynamic reference, then deleted | Deletion is self-guarding |
| QB-03 | Raw `print()` in app code | 114 in app code (not the 408 estimated, which counted scripts and tests); 64 converted. `direct_message_service` held 34 putting two user UUIDs on stdout, where the SEC-05 scrubber never saw them | Guarded by CI-06 |
| QB-05 | Three migration directories with ambiguous authority | Legacy two archived. The real finding was larger: **56 of 64** files in `supabase/migrations/` carry a version stamp differing from the recorded one, and 3 appear in no history row. `supabase db push` would attempt ~59 already-applied migrations | Documented at the top of `supabase/migrations/README.md`. No guard is possible — it is a property of the live catalog |
| QB-06 | Repository-pattern endgame | **Decision: fenced, full migration declined on cost.** ~9% adherence is the accepted steady state. New code uses repositories; existing direct-DB code shrinks only incidentally | CI-02 is the fence |
| QF-06 | Bundle weight | Two of three claims were already false (OpenCV and pdf-lib were already lazy). `html2pdf` was **not** — three pages imported it at module scope, so every visitor to a public transcript downloaded the PDF machinery. Now on demand. Consolidating the three PDF libraries was declined: they do three different jobs | Nothing stops a future eager import. The 4GB build heap is unmeasured |
| OPS-02 | `render.yaml` was not in effect | Reconciled against the live API. Three findings mattered more than the rewrite: **www.optioeducation.com is served by `optio-marketing`**, which was missing from the file entirely; **neither backend installs ffmpeg**, so server-side video probing is silently off; and the security headers *are* live on `app.` but www returns only `x-content-type-options` | Dashboard state cannot be asserted from the repo |
| OPS-04 | Student evidence (3,548 objects, 8.36 GB) had no backups | `.github/workflows/backup-storage.yml` — weekly, `rclone sync`, client-side `crypt`. Green end to end 2026-09-05, including a decryption round-trip. Three guards against the *backup* job: a 1,000-object source floor, `--max-delete 100`, and a pull-back-and-decrypt step | Scheduled workflow; a failure emails the repo owner. **Four defects shipped here that were reviewable on paper and only visible against reality** — wrong region, wrong docs URL, a SIGPIPE, and a GCS lifecycle rule that would have deleted all 3,548 objects on 2026-12-04 |
| OPS-06 | `marketing/` existed only untracked | Resolved by the owning session; 63 files are on `main` | n/a |
| OPS-08 | ~70 hand-run prod-repair scripts, 21 keyed to one personal account, **8 of which write to production** | `scripts/_target_user.py` — `--user-email` required with no default; the 8 mutating scripts also require `--yes`. Runbook at `backend/scripts/README.md` covering all 71, **37 of which write** | The runbook's last rule is the one that matters: names like `check_feb15_task.py` were written for one past incident and still run. That is not the same as still being correct |
| HYG-01 | Committed junk | Six dead Windows scripts deleted (verified unreferenced); `test-output.txt` and `.debug-sessions/` untracked and gitignored. The tracked `__pycache__` the finding mentions did not exist | `.gitignore` prevents the first two |
| HYG-02 | 20 tracked hash-named `.mjs` scripts in `verify/` | Deleted with `git rm` on the user's instruction; recoverable via `git log -- verify/` | n/a |
| HYG-03 | Three carried pip-audit CVE suppressions | Re-run with the ignores removed — the only way to find out. Two were silencing nothing (worst state for a suppression: reads as accepted risk, is dead config). The third was real and was **fixed** by bumping pytest to 9.0.3. `pip-audit` now runs with no suppressions | The workflow comment requires a dated reason **and** a re-check date for any future ignore |
| FU-02 | `public.get_human_quest_performance` read two dropped tables | Verified dead four ways (no repo caller, no other function, no pg_cron job, EXECUTE granted only to postgres/service_role), then dropped. Rewrite was rejected: two of its four columns are computed *from* the dropped tables | "Does a function's tables exist" is a property of the live catalog, which no offline test sees |

---

## 3. The 2026-08-01 audit IDs, cited by code comments

`AUDIT.md` is deleted. About 20 code comments across `backend/`,
`.github/workflows/`, `scripts/` and `supabase/` cite its finding IDs in prose
("AUDIT.md C1"). Those citations are kept — the IDs still grep, and rewriting
comments in files other sessions are editing costs more than it buys. This table
is what they now resolve to.

| ID | Finding | Outcome |
|---|---|---|
| **C1** | A live Stripe **secret** key for a paying org was readable by anyone on the internet, unauthenticated — stored in a JSONB column whose RLS policy filters rows but cannot filter columns | Fixed. Secrets moved to `organization_secrets` (RLS on, no policies, grants revoked); reads go through `backend/utils/org_secrets.py`. **The key was rotated — it had been readable for an unknown period** |
| **C2** | `portfolio_visibility_reset_20260801` — 718 rows of per-student minor-status and consent flags, RLS disabled, `SELECT`/`DELETE`/`TRUNCATE` granted to `anon` | Applied to production 2026-08-01 |
| **C3** | `GET /api/auth/me` returned the org's full secret config to every member, including students | Fixed: `routes/auth/login/core.py` strips known credentials; the durable guarantee is that the column no longer holds any |
| **H1** | All student evidence media sat in public storage buckets, served to unauthenticated `GET` | Out of the requested scope at the time. See OPEN_FINDINGS.md |
| **H2** | Masquerade and acting-as sessions were immortal and survived logout | Closed by SEC-08 and FU-05 |
| **H3** | `sis_billing_audit` — RLS disabled, anonymously writable audit trail | Applied to production 2026-08-01 |
| **H4** | Student evidence readable over the public anon key (1,574 objects incl. photos and videos of minors) | Applied 2026-08-02 |
| **H5** | The 2026-08-01 reset checked that consent *existed*, not **who gave it** — 4 of 6 consent records were self-granted by minors | Applied 2026-08-02. Two portfolios re-privatized; a `trg_publication_consent_provenance` trigger on `diplomas` now refuses publication on a minor's self-consent. It must be a trigger: every product write goes through Flask on the service-role client, which bypasses RLS |
| **H6** | `bounties` (15 of 17 rows `visibility='family'`) and `curriculum_attachments` anon-readable | Applied 2026-08-03. Found by the scheduled exposure audit, not by a person |
| **L1** | Two dependency manifests diverged; one is documented but unused | Closed by SEC-17 |
| **L2** | The migration history cannot reproduce the deployed schema | Confirmed and quantified by QB-05; the apply path is OPEN (OPS-03) |
| **M1–M6, L3–L5** | Medium/low findings, explicitly out of the requested scope | **Never triaged.** See OPEN_FINDINGS.md |

The standing detection built for this audit — worth not deleting:

- `backend/tests/test_secret_exposure_guard.py` (42 tests), wired into
  `release.yml` as its own step. Fails the build if a migration creates a table
  without RLS, if code reads a credential out of `feature_flags`, or if `/me`
  stops stripping.
- `scripts/audit_db_exposure.py` + `.github/workflows/db-exposure-audit.yml` —
  **daily, against production**, opening a `security` issue on failure. This is
  the half that matters: C1 and C2 both entered through the dashboard, so no
  repo-based check could ever have seen them. It found H6 unprompted.

---

## 4. How this was verified, and what that does not prove

Every finding above was re-checked against the tree on 2026-09-08 rather than
trusted from its status line. What that means concretely:

- Every guard file named in §1 was confirmed to exist.
- The backend suite was run: **5,528 passed, 160 skipped, 0 failed.**
  The web suite: **322 files, 2,829 passed, 0 failed.**
  So every guard test listed above is passing today.
- Ratchet and exemption states were read directly: `EXEMPTIONS` in
  `test_route_file_sizes.py` and `EXEMPT` in `componentSize.test.js` are both
  empty, as claimed.
- Point fixes were greped for in the code (`install_pii_scrubbing`,
  `get_deescalation_user_id`, `POSTGREST_ROLE`, `enc:v1:`,
  `masquerade_body_tokens`, `GUARDIAN_RELATIONSHIPS`, the deleted
  `exceptions.py`, the deleted `verify/`, `OAUTH_PROVIDER_ENABLED`).
- OPS-09 was measured rather than read: 0 CRLF blobs across 3,664 tracked text
  files.

**What this does not prove.** A passing guard proves the guard passes. For the
findings in §2 there is no guard at all, so "closed" there rests on reading the
code and on the log of whoever closed it. And for anything whose state lives
outside the repo — Render env vars, Supabase policies, GCS lifecycle rules,
Sentry monitors — nothing in this repository can confirm it. Those are the items
in OPEN_FINDINGS.md's NEEDS TANNER section, and they are exactly where the
OPS-04 work shipped four defects that every reviewer had read and no one had run.

One correction to the old plan's own record, found during this pass:

- **OPS-09 was marked `BLOCKED`. It is not — it was completed on 2026-09-08**,
  hours after the plan's last update, in commit `5638a977`. Verified
  independently, as above. It is closed in §1.
