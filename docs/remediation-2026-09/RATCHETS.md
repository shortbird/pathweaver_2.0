# Ratchets, guards and gates — the enforcement inventory

**As of 2026-09-10.** Every mechanical control in this repository, in one place,
with what it protects and what its current ceiling is.

This file exists because the controls were spread across 115 test files,
workflows and gate scripts, and nobody could answer "what actually stops this
regressing?" without reading all of them. It is also the file to edit when a
number legitimately moves — the numbers below are the numbers in the code, and
if the two disagree, the code is right and this file is stale.

## What a ratchet is, and the rules for touching one

A **ratchet** counts something that is too expensive to fix and too dangerous to
let grow. It fails when the count goes up. It is not a to-do list: several of
these are the accepted steady state, decided on cost.

A **guard** asserts an absolute — zero occurrences, one definition, a structure
that must hold. It fails on the first violation.

Four rules, learned the hard way:

1. **A ceiling moves down, never up.** Raising one to make a build pass converts
   a fence into a record of when somebody gave up.
2. **If a count genuinely drops, lower the ceiling in the same commit** and say
   why in the message. A floor of slack below the real number means that much of
   the fix can be silently undone.
3. **Every ratchet needs a floor as well as a ceiling.** A scan that stops
   finding call sites — a moved directory, a changed regex — passes forever and
   looks exactly like success. Most of the ones below carry one; the column says
   which do not.
4. **An exemption carries a written reason.** Five exemption structures are
   deliberately empty (§2b), and an entry appearing in one of those is a
   regression rather than a decision.

---

## 1. Counting ratchets

| Ceiling | Where | Protects |
|---|---|---|
| Direct `.table()` calls per layer: routes 2,342, services 1,847, repositories 465, utils 144, jobs 7, middleware 3, modules 1 — plus routes+services as a combined total | `backend/tests/unit/test_direct_db_calls_do_not_grow.py` | CI-02, layering. The combined total is asserted separately so moving a call down a layer cannot pass as a fix. This file's baselines change most often; read them there, not here |
| 449 `datetime.utcnow()` calls | `backend/tests/unit/test_one_definition_of_now.py` | QB-02. Naive-vs-aware comparison raises `TypeError`; three of 35 `_now` copies were naive |
| 12 cross-layer import violations | `backend/tests/unit/test_import_layers.py` | Layering: repositories importing routes, and similar |
| 23 direct storage uploads outside the service | `backend/tests/unit/test_storage_upload_goes_through_service.py` | Uploads that skip validation and virus scanning |
| 5 `get_user_client` + 12 `supabase` client constructions in new route files | `backend/tests/unit/test_new_routes_use_repositories.py` | The repository pattern, for new code only |
| 113 direct `os.getenv`/`os.environ` reads outside the app layers | `backend/tests/unit/test_config_access_ratchet.py` | Rule 9's other half. The app layers themselves are at zero (see §2) |
| 33 app-layer + 9 script queries against dropped tables | `backend/tests/unit/test_dropped_tables_are_not_queried.py` | 500s from tables production does not have. Invisible to every other check here |
| 6 writes to `users.is_org_admin` | `backend/tests/unit/test_role_rules_are_enforced.py` | The flag is derived by a trigger; a hand-written value is silently reverted |
| 293 off-palette hex literals | `web/src/__tests__/brandPalette.test.js` | QF-07. Reads the sanctioned palette out of `tailwind.config.js`, so it cannot drift from the design system |
| 981 hand-rolled fetch call sites | `web/src/__tests__/dataFetchingParadigm.test.js` | QF-03. Counts **call sites**, not files, so a pure component split does not move it |
| 292 eslint errors / 2,183 warnings | `web/src/__tests__/eslintRatchet.test.js` | CI-03. 273k lines written without a linter; the point is that the number stops growing |
| 5 `console.*` calls | `web/src/__tests__/lintRules.test.js` | CI-03. `console.warn`/`error` stay legitimate; `.log` became `logger.debug` |
| 142 clickable non-interactive elements | `web/src/components/ui/__tests__/a11y.test.jsx` | QF-08. The file says out loud that axe catches maybe a third of real problems |
| 580 explicit `any` | `mobile/src/__tests__/typeWidening.test.ts` | QF-09 |
| 1,400 lines per route file | `backend/tests/unit/test_route_file_sizes.py` | QB-04. **`EXEMPTIONS` is empty** |
| 1,000 lines per web component | `web/src/__tests__/componentSize.test.js` | QF-02. **`EXEMPT` is empty**, and a fourth test fails when a file drops under the cap and its exemption lingers |
| 55 known-dead client API paths | `backend/tests/test_client_api_paths_exist.py` | Every `/api/...` the web and mobile clients call is a real route. The dead list may only shrink |
| 72 modals with a raw fixed-inset backdrop | `web/src/tests/modalPortalGuard.test.js` | Modal overlays render through a portal. A separate test fails on a stale entry |
| Per-file class-scope call floors (attendance 2, catalog 2, submissions 1, engagement 2, staff portal 2, gradebook 6, student records 1) | `backend/tests/unit/test_class_scope_coverage.py` | Teacher-reachable SIS reads apply `class_scope`. Allowlist of 10, each with a reason |
| 1 definition of the admin client | `backend/tests/unit/test_one_admin_accessor.py` | One place that builds a client which bypasses RLS |

**Two-sided ratchets.** Five of the above also fail when the count drops *too
far below* the baseline: `eslintRatchet` (slack 60), `brandPalette` (40),
`dataFetchingParadigm` (40), `typeWidening` (60), and the `utcnow` baseline. The
reason is worth understanding — a large silent drop is more often a broken scan
than a cleanup, and slack below the real number is the fraction of a fix that
can be undone without anything failing. When you legitimately reduce a count,
lower the baseline in the same commit.

## 2. Absolute guards

These assert zero, or one, or a structure. No number to raise.

**Auth and access**

- `test_require_role_names_are_real.py` — every role name handed to
  `@require_role` is a role that can exist. SEC-01.
- `test_role_rules_are_enforced.py` — every literal role list includes
  `superadmin`; all five `sis_roles` tuples contain it.
- `test_id_routes_declare_relationship.py` — every id-bearing route declares
  `@require_relationship_to`, is superadmin-only, or is allowlisted with a
  written reason. SEC-10. Companion tests forbid stale allowlist entries.
  **Its `REVIEWED_2026_09_03` dict reads as empty and is not** — 23 `_reviewed()`
  calls populate it at import. Do not mistake it for one of the empty
  exemption lists in §2b.
- `test_auth_resolvers_fail_closed.py` — the three user resolvers agree across a
  credential matrix; `get_deescalation_user_id` has exactly two call sites.
- `test_verify_token_access_only.py` — a refresh token is never an access token.
- `test_token_delivery.py` — no route returns a credential in a JSON body.
  Walks all of `routes/` against four field names.
- `test_acting_as_cookie.py`, `test_masquerade_cookie.py` — the exits, not the
  entrances.
- `test_no_stacked_auth_decorators.py`, `test_no_duplicate_routes.py` — one
  route, one owner. Four production bugs came from the second.
- `test_oauth_provider_disabled.py` — the OAuth provider stays off by default.
- `test_postgrest_role_claim.py`, `test_user_xp_skill_table_denied.py`,
  `test_sis_org_gates.py`, `test_transcript_org_scope_gate.py`,
  `test_dependents_relationship_gate.py`, `test_class_scope_coverage.py`,
  `test_guardian_scope.py` — org and relationship scoping.

**Secrets and disclosure**

- `test_secret_exposure_guard.py` (42 test cases, its own CI step) — a migration
  cannot create a table without RLS; code cannot read a credential out of
  `feature_flags`; `/me` cannot stop stripping.
- `test_postgrest_filter_injection.py` — nothing interpolates a raw value into a
  PostgREST filter string. Four allowlisted names, each with a reason.
- `test_private_storage_urls.py` — every avatar and evidence read path signs
  before it serialises. **`_PENDING_REMEDIATION` is empty**, which is the
  assertion that there is nothing left.
- `web/src/utils/__tests__/dangerouslySetInnerHTML.lint.test.js` — every such
  call routes its HTML through `sanitizeHtml`.
- `web/src/utils/__tests__/metaPixelDeferred.lint.test.js` — the Meta Pixel does
  not fire on page load.
- `test_log_pii_scrubbing.py` — the scrubber is installed, including where
  Sentry reads records outside the handler chain. SEC-05.
- `test_no_config_disclosure_routes.py` — the retired debug routes stay 404.
- `test_no_exception_text_in_5xx.py` — no exception text in a 5xx body. SEC-11.
- `test_no_raw_service_error_passthrough.py`, `test_decorator_exception_masking.py`.
- `test_org_secret_encryption.py` — including that a malformed key **raises**
  rather than reading as "not configured".
- `test_no_hardcoded_superadmin_identity.py` — and that the default staff list
  did not quietly change. OPS-07.
- `test_jwt_key_rotation.py` — no new hand-rolled `jwt.decode` of app tokens.

**Structure and single definitions**

- `test_one_admin_accessor.py` — one definition of the admin client.
- `test_one_definition_of_guardian.py` — one `GUARDIAN_RELATIONSHIPS`.
- `test_single_model_source.py` — `Config.GEMINI_MODEL` is the only place a
  Gemini model name appears.
- `test_admin_client_justified.py` — 1,133 admin-client call sites each carry a
  justification. Floor of 500 catches "the scan broke".
- `test_no_raw_env_in_routes.py` — zero direct env reads in routes, services,
  repositories, middleware, utils. Rule 9's enforced half.
- `test_no_raw_print_in_app_code.py`, `test_no_debug_tagged_logs.py` — CI-06 and
  FU-04. The second bans the **tag**, not the level, because the tag is the
  decidable part.
- `test_lazy_import_not_used_in_handler.py` — FU-01, proven against the real
  pre-fix file.
- `test_org_role_constraints.py` — a role added to `OrgRole` has a matching
  CHECK constraint, or CI fails rather than production.
- `test_requirements_are_bounded.py` — every root dependency has an upper bound.
  Empty allowlist. SEC-17.
- `test_line_endings_stay_lf.py` — OPS-09.
- `test_module_registry.py`, `test_module_coverage.py`, `test_module_gate.py`,
  `test_register_all.py` — the module system and blueprint registration.
- `test_claude_hooks.py` — the three hooks in §4 actually refuse what they claim,
  and actually allow what they must.

**Cross-surface conformance** (a rule extracted to `shared/`, checked per surface)

- `test_rich_text_conformance.py`, `test_role_resolution_conformance.py`,
  `test_school_subjects_shared.py`, `test_pillar_constants_generated.py`,
  `test_credit_constants_generated.py` (backend)
- `mobile/src/__tests__/sharedAlias.test.ts`, `pillarPalette.test.ts`,
  `designTokens.test.ts`, `importCase.test.ts` (mobile)
- `web/src/__tests__/apiBoundaryIsTypeScript.test.js`, `importCycles.test.js`
  (both apps), `lazyHeavyLibraries.test.js`, `csrfRequestBody.test.js` (both apps)

**Closed-but-unguarded findings, now guarded**

`test_closed_findings_stay_closed.py` — 19 tests covering SEC-04, OPS-08, QB-01,
DOC-01 to DOC-05, HYG-03, OPS-04's three safety rails, and OPS-02's repo half.
Its header records what cannot be guarded from a repository at all, and why.
**`test_doc03_every_link_in_claude_md_resolves` is the reason a link added to
CLAUDE.md must point at a file that exists.**

## 2b. Exemption lists that are empty on purpose

An entry appearing in one of these is a regression, not a decision. They are
listed together because "the list is empty" is the whole assertion.

| Structure | File |
|---|---|
| `EXEMPTIONS: dict[str, int] = {}` | `backend/tests/unit/test_route_file_sizes.py` |
| `UNBOUNDED_ALLOWED: dict = {}` | `backend/tests/unit/test_requirements_are_bounded.py` |
| `_PENDING_REMEDIATION: dict = {}` | `backend/tests/test_private_storage_urls.py` |
| `EXEMPT = {}` | `web/src/__tests__/componentSize.test.js` |
| no `web/audit-allowlist.json` at all | the web app has no accepted advisories |

`mobile/audit-allowlist.json` has two entries, both `image-size`, both with a
`recheck_after` of 2026-10-08. `audit-gate.mjs` fails on an expired entry, on the
principle that an accepted risk nobody looks at again is an unaccepted one with
better paperwork.

## 2c. Guards that do not run in a normal local run

Worth knowing, because a green local run is not the same as a green CI run, and
because a guard that silently stops running is the failure mode this whole
inventory exists to prevent.

| What | Why it does not run locally |
|---|---|
| `backend/tests/integration/*` — 133 tests including `test_rls_org_isolation.py` | `requires_db`. They need a local Supabase stack, and run enforcing in `tests-integration.yml`. The RLS suite is arguably the most security-relevant file in the repository and it never runs on a laptop without Docker |
| Two of the three tests in `test_no_config_disclosure_routes.py` | One is `requires_db`; the other two do run |
| `test_module_registry.py` | `skipif` on a generated JSON file being absent — it vanishes silently if the registry is not generated |
| Four cases in `test_file_upload_validation.py`, six in `test_curriculum_lesson_service.py` | Carry explicit skip markers |

Historical note, because it is the exact shape to watch for:
`test_admin_client_justified` was **deselected in CI** while ~195 unjustified
admin-client calls existed. It read as enforcing and was not. The deselect was
removed on 2026-09-03 and it gates now.

## 3. Coverage floors

Ratchet up, never down. Set just under the measured value so a regression fails
and normal churn does not.

| Suite | Floor | Measured | Set in |
|---|---|---|---|
| Backend | 41% | not measured on this machine — see the register | `ci.yml`, `release.yml` (`coverage-floor`) |
| Web | 60% | 61.69% statements (2026-09-10) | `ci.yml`, `release.yml` |
| Mobile | 36 stmt / 29 br / 38 line / 29 fn | 37.94 / 30.67 / 39.35 / 30.01 | `mobile/jest.config.js` |

Both `ci.yml` and `release.yml` carry the backend and web numbers and **they
must match** — one gates the merge, the other gates the deploy.

## 4. Hooks

`.claude/settings.json`, scripts in `.claude/hooks/`. These run on every agent
working in this repository. All three fail open: a hook that raises exits 1, the
work continues, and the failure is visible.

| Hook | Event | Refuses |
|---|---|---|
| `guard_bash.py` | PreToolUse (Bash) | `git reset --hard`, `checkout --`, `restore`, `stash`, `clean`; `killall`/`pkill node`; `git add -A`/`commit -a`; emoji in a commit message. Stops a push to `main` and a force-push for confirmation, with an `OPTIO_HOOK_OVERRIDE=1` escape |
| `fast_gate.py` | PostToolUse (Edit/Write) | ruff + pyflakes on Python, eslint (against the file at HEAD) on JS/TS, `tsc --noEmit` on mobile TS |
| `related_tests.py` | Stop | Runs the tests belonging to the files the session touched; blocks the stop if they fail |

The destructive-git family has **no override**. Everything else does, because a
gate nobody can get past is a gate somebody deletes.

## 5. CI gates and scheduled audits

| Gate | Where | What it stops |
|---|---|---|
| ruff (F/E9/B/S110/S112) | `tests-backend.yml` | CI-01 |
| mypy (292 modules carry `ignore_errors` in `backend/mypy.ini`, out of 302 named sections; the list only shrinks) | `tests-backend.yml` | CI-01 |
| pyflakes, filtered to undefined names | `tests-backend.yml` | Missing imports, which Python only finds when a request reaches the line. Four were live on 2026-09-02 |
| pip-audit, **no suppressions** | `tests-backend.yml` | HYG-03. A future ignore needs a dated reason and a re-check date |
| `npm audit` via `scripts/audit-gate.mjs` | `tests-web.yml`, `tests-mobile.yml` | Advisories, one at a time, each allowlisted with a reason and an expiry |
| 133 integration tests on a local Supabase stack | `tests-integration.yml` | Real RLS behaviour. Enforcing, and it holds the deploy (CI-05) |
| `scripts/audit_db_exposure.py`, daily against production | `db-exposure-audit.yml` | The half no repository check can see: a table made public through the dashboard. It found H6 unprompted |
| Weekly encrypted storage backup with three safety rails | `backup-storage.yml` | OPS-04 |
| Preview-branch reaper, daily | `supabase-branch-reaper.yml` | Abandoned Supabase preview branches were 38% of one month's invoice |
| `max_pending` tripwire (default 3) | `migrate-prod.yml` | An accidental `db push` against an unreconciled history |
| Daily database backup, with a dump-size floor of 5MB and a pinned pg_dump 17.x | `backup-db.yml` | A truncated backup that uploads successfully |
| `generate-constants.mjs --check` | `tests-web.yml` | Editing `shared/data/*.json` without regenerating the constants |
| `tsc --noEmit`, gating since 2026-08-18 | `tests-mobile.yml` | Type errors in the mobile app. Kept at zero |

**Never point a test suite at a Supabase preview branch.** They cost real money
and put a service-role key for a production clone in CI. Use the local stack.

---

## 6. Cross-reference: every closed finding names its guard

Checked against [CLOSED_FINDINGS.md](CLOSED_FINDINGS.md) on 2026-09-10. The
question this answers is the one that file's own §2 raises and leaves open —
which closed findings can quietly regress.

**Guarded (CLOSED_FINDINGS §1 and §1b).** All 40 findings in §1 name a guard
file, and every one of those files exists and passes. They are listed by finding
ID in that file's own table; §1 and §2 above are the same set arranged by
mechanism rather than by finding.

**Was unguarded, now guarded.** These were in §2 ("Closed but unguarded") when
that file was written. `test_closed_findings_stay_closed.py` covers them now:

| ID | Guard |
|---|---|
| SEC-04 | `TestSec04EnvExamplesNameNoRealProject` |
| QB-01 | `TestQb01DeletedCodeStaysDeleted` |
| DOC-01 … DOC-05 | `TestDocsDoNotRotBack` (6 tests) |
| HYG-03 | `TestHyg03PipAuditHasNoUnexplainedSuppressions` |
| OPS-04 | `TestOps04TheBackupJobKeepsItsSafetyRails` (3 rails) |
| OPS-08 | `TestOps08OneOffScriptsRefuseToGuess` (4 tests) |
| OPS-02 (repo half) | `TestOps02RenderYamlKnowsAboutTheMarketingSite` |

**Still unguarded, and why.** These are the ones a reviewer must check by hand.
The reason is the same in every case: the state lives outside this repository.

| ID | What is unguarded | Why nothing here can assert it |
|---|---|---|
| SEC-14b | `FLASK_SECRET_KEY_OLD` is set on the prod backend | A live Render environment variable. Dated action to 2027-03-02 — see the register |
| SEC-16b | `ORG_SECRETS_ENCRYPTION_KEY` is reaching the app | Same, plus rows re-encrypt lazily, so the table cannot confirm it either |
| SEC-06 | The advisor daily summary stays deleted | The code is gone; there is nothing to assert. Two external leftovers are in the register |
| QB-05 | The migration history matches the files | A property of the live Postgres catalog |
| FU-02 | The dropped function stayed dropped | Same |
| OPS-02 (dashboard half) | Which service serves which domain; whether ffmpeg is installed | Dashboard state |
| QB-06, QF-03 | The declined migrations stay declined | A decision, not a state. CI-02 and the fetch ratchet fence the debt |
| QF-06 | No future eager import of a heavy library | Partly guarded — `lazyHeavyLibraries.test.js` covers the three known libraries, not the class |
| AUDIT.md C1–H6 | The production RLS and grant state | Guarded operationally rather than statically, by the daily `db-exposure-audit` run against production |

**One honest gap in this cross-reference.** A passing guard proves the guard
passes. For anything whose state lives outside the repository, "closed" rests on
the log of whoever closed it — and that is exactly where the OPS-04 work shipped
four defects that every reviewer had read and nobody had run.
