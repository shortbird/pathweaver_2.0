# REPO_STATE.md

Recon 2026-09-09, commit `55e7f1c` on `main`. The session clone was shallow (251 commits); `git fetch --unshallow` recovered 4,206 commits, and all churn figures use the full history.

Stack correction: not an Expo-only app. Flask 3.0 backend + React 18/Vite web (`frontend/`, v1, production web) + Expo SDK 55 mobile (`frontend-v2/`, v2) + Astro marketing site + Supabase + Render.

## 1. Scale

781,082 lines / 3,650 tracked files (`git ls-files`, excluding lockfiles and binaries).

| Dir | Files | Lines | | Ext | Files | Lines |
|---|---:|---:|---|---|---:|---:|
| backend | 1,247 | 350,929 | | .py | 1,112 | 322,586 |
| frontend (v1) | 1,367 | 273,034 | | .jsx | 1,083 | 240,195 |
| frontend-v2 | 471 | 75,396 | | .md | 198 | 56,573 |
| docs | 225 | 44,221 | | .tsx | 232 | 49,751 |
| supabase | 201 | 19,188 | | .sql | 333 | 33,364 |
| marketing | 40 | 3,339 | | .js | 285 | 31,543 |
| tests (e2e) | 15 | 2,989 | | .ts | 185 | 23,030 |
| scripts | 13 | 2,889 | | .yml/.yaml | 73 | 5,725 |
| (root) 19/2,460 · .github 16/2,237 · shared 11/1,978 · design-system 4/1,270 · .design-sync 19/557 · .claude 1/16 | | | | .html 46/4,074 · .astro 20/2,272 | | |

**15 largest source files:** `backend/services/sis_billing_service.py` 2,907 · `sis_service.py` 2,504 · `email_service.py` 1,965 · `interest_tracks_service.py` 1,942 · `base_ai_service.py` 1,777 · `frontend-v2/app/(app)/(tabs)/admin.tsx` 1,620 · `sis_parent_service.py` 1,607 · `bounty_service.py` 1,417 · `personalization_service.py` 1,416 · `sis_onboarding_service.py` 1,408 · `routes/admin/user_invitations.py` 1,387 · `routes/admin/user_management.py` 1,374 · `routes/admin/curriculum_upload.py` 1,372 · `quest_ai_service.py` 1,344 · `routes/sis/staff_training.py` 1,341. Largest tracked file: `supabase/migrations/20260812000000_baseline_prod_schema.sql` 7,743.

**Packages:** 4 `package.json`, **no workspaces**. frontend-v2 58+12 deps; frontend 39+20; marketing 3+4; root 3+1. Python: root `requirements.txt` 83 packages (the file Render installs), plus `backend/requirements.txt` and `backend/requirements-test.txt`. **`backend/requirements-test.txt` pins `pytest==7.4.3` against root's `pytest==9.0.3`; installing both is a hard pip resolution failure.** CI installs only the root file.

## 2. Existing artifacts

| Artifact | Path | Last commit | Size |
|---|---|---|---|
| Live audit tracker | `docs/audit-2026-08/REMEDIATION_PLAN.md` | 2026-09-07 | 3,964 lines |
| External audit | `docs/archive/AUDIT.md` | 2026-09-03 | 844 lines (audit dated 2026-08-01, commit `40362bb`) |

`REMEDIATION_PLAN.md` tracks **61 findings** from a 2026-08-31 four-specialist audit, prefixed by area: SEC 17, QF 9, OPS 9, QB 6, FU 6, CI 6, DOC 5, HYG 3. Status is per-item, not severity-graded; 7 tagged `(low)`. **56 DONE, 2 WONTFIX (SEC-18, OPS-05), 2 NEEDS-USER (OPS-01 no staging DB, OPS-03 migrations unapplied by any pipeline), 1 BLOCKED (OPS-09 CRLF renormalize).** Spot-checks confirm DONE claims: `/api/auth/cookie-debug` is gone, `ruff check backend` passes, route-size and duplicate-route guards exist with empty exemption lists, org Stripe keys encrypted. `AUDIT.md`'s three CRITICAL findings are closed: **0 public tables lack RLS**; 6 of 20 storage buckets are public, all non-PII (`course-covers`, `curriculum-images`, `docs-images`, `mobile_app`, `quest-headers`, `quest-images`, `site-assets`).

**CLAUDE.md:** exactly one, repo root, 634 lines / ~4,000 words, modified 2026-09-08 while its header still reads "Last Updated: August 11, 2026". No `AGENTS.md`, `.cursorrules`, `CLAUDE.local.md`, or user-level `~/.claude/CLAUDE.md`. Not reproduced here — see §"could not verify".

**`.claude/`:** one file, `settings.local.json` (16 lines, permissions allow-list, 51 commits of churn). **No `commands/`, `skills/`, or `agents/`.** 54 command files existed and were deleted in `fa8972de` (2026-03-20).

**Hooks: none.** No `hooks` key in any repo JSON, no `.git/hooks` beyond samples, no husky/lefthook/pre-commit.

**MCP:** `.mcp.json` declares one server, `supabase-pathweaver` (HTTP, `project_ref=vvfgxcykxjybtvpfzwyx`, `Bearer ${SUPABASE_PAT}`). It **failed to connect** this session — HTTP 401, "JWT could not be decoded".

## 3. Test infrastructure

| Suite | Framework | Files | Cases | Wall time | Result |
|---|---|---:|---:|---|---|
| Backend | pytest 9.0.3 | 404 | 5,667 | **365 s** | 5,507 pass, 160 skip, **0 fail** |
| Web v1 | vitest | 321 | 2,815 | **271 s** | 2,815 pass, 0 fail, 0 skip |
| Mobile v2 | jest-expo | 112 | 924 | **47 s** | 921 pass, 3 skip, 0 fail |
| Integration | pytest `requires_db` | 10 | 124 | not run | needs local Supabase stack |
| E2E | Playwright | 5 + 21 specs | 22+ | not run | needs live app |

The 160 backend skips are the `requires_db` set (12 files) that CI runs separately. Coverage measured this session, not estimated:

| Suite | Floor | Measured |
|---|---|---|
| Backend | 41% (`ci.yml`) | **56%** line |
| Web v1 | 53% | **60.94 stmt / 52.85 br / 54.76 fn / 62.87 line** |
| Mobile v2 | 31/24/32/23 (`jest.config.js`) | **37.84 / 30.62 / 39.26 / 29.84** |

**Path coverage.** Covered: signup/auth (23 auth-named backend files, `test_token_delivery.py`, `test_jwt_key_rotation.py`); enrollment (5 files); quest creation (`test_class_quest_endpoints.py`, `test_curriculum_routes.py`); submission/completion (26 files touching `quest_task_completions`); credit calculation (9, incl. `test_credit_ledger.py`, `test_subject_credit_fidelity.py`); payments/billing (20, incl. `test_sis_tuition_autopay.py`); LMS/LTI (3 backend + 6 frontend files). **Partial: org isolation / RLS** — 36 backend files assert cross-org denial at the Flask layer, but **no test file is named for RLS** and RLS itself is exercised only by the 124 integration tests.

**CI:** 14 workflows. Suites are defined once in reusable `workflow_call` files and invoked by both gates, so merge gate == deploy gate.
- `ci.yml` — `pull_request` → main/develop **and** `push` → develop. Backend + web + mobile + integration. Blocks merge.
- `release.yml` — `push` → main. Same four; `deploy` needs `[backend, web, integration]`, `ota` needs `[backend, web, mobile]`. Render prod auto-deploy is OFF, so **CI is the only prod deploy trigger**; bad code can land on `main` but cannot deploy.
- Extra enforcing gates in `tests-backend.yml`: pyflakes undefined-names (**0**), ruff (**passes**), mypy on a typed subset (300 modules exempted by name; 1,101 checked), pip-audit `--strict`, no suppressions.
- No branch protection on `main` (deliberate, OPS-05). Dependabot: 5 ecosystems, weekly, 2 PRs each.

## 4. Architecture as it actually is

**Data access is server-side only.** `supabase.from(`/`supabase.rpc(` appears **0 times** in both frontends; `@supabase/supabase-js` is imported in exactly 2 files and used only for auth callback, realtime channels, and signed uploads. Everything else goes through the Flask API.

Backend: **5,111 `.table(` and 43 `.rpc(`** call sites outside tests — services/ 1,819 (171 files), routes/ 2,146 (274 files), repositories/ 439 (37 files), scripts/ 342, utils/ 122. The repository pattern covers ~8% of call sites; `test_direct_db_calls_do_not_grow.py` caps routes ≤2,340, services ≤1,828, combined ≤4,168 — a ceiling, not a migration (QB-06 declines the full migration).

**RLS is bypassed almost everywhere:** `get_supabase_admin_client()` **1,552** call sites vs `get_user_client()` **30**. Authorization is re-derived in Flask per route; every admin-client call carries a justification comment enforced by `test_admin_client_justified`. 1,456 route decorators, 186 `register_blueprint` (116 in `routes/__init__.py`, 36 in `routes/sis/__init__.py`).

**Top 5 duplications:**
1. v1↔v2 parallel implementations — **40 same-named modules**. `frontend/src/services/api.js` (1,083) vs `frontend-v2/src/services/api.ts` (806); `signedUpload` 160/368; `sentry` 65/277; `useQuests` 386/251; `useNotifications` 179/320; `useBounties` 266/255.
2. **`def _admin(` redefined in 66 separate backend service modules.**
3. Two data-fetching paradigms in v1: 40 files use react-query via `hooks/api/` (30 hooks); **1,095 raw `api.*` call sites** remain in pages/components, ratcheted by `dataFetchingParadigm.test.js`.
4. Two state paradigms: v1 = react-query + 8 React contexts, **0 zustand**; v2 = 16 zustand stores, **0 react-query**. No shared state layer.
5. Pillar/subject constants re-declared in `backend/utils/pillar_utils.py` + 6 AI services alongside canonical `shared/pillars.ts`/`subjects.ts` (86/84 refs).

**Circular imports** (madge 8, 1,339 + 375 files): v1 **3** — `components/curriculum/blocks/index.js` ↔ `CalloutBlockEditor.jsx`, ↔ `DividerBlockEditor.jsx`, and `pages/sis/OnboardingPage.jsx` ↔ `components/sis/tasks/PaperworkTemplatesManager.jsx`. v2 **1** — `src/stores/authStore.ts` ↔ `src/services/landingRoute.ts`.

**Files mixing unrelated concerns:** `sis_billing_service.py` — 98 functions, 123 `.table(` calls, mixes fee computation, invoice numbering, Stripe, payment plans, audit logging. `sis_service.py` — 88 functions, 95 `.table(` calls, mixes org-context resolution, role predicates, generic chunking utilities. `frontend-v2/app/(app)/(tabs)/admin.tsx` — 1,620 lines, 19 components in one route file.

**TypeScript:** v1 is plain JS, **no tsconfig**, 0 `@ts-ignore`. v2 `strict: true`, `tsc --noEmit` **0 errors**, but **717 `any` occurrences**, 3 `@ts-expect-error`, 0 `@ts-ignore`.

**ESLint:** config exists for **v2 only**. It runs **0 errors, 484 warnings** (103 `react-hooks/set-state-in-effect`, 93 `no-require-imports`, 86 `import/no-named-as-default`, 64 `react/no-unescaped-entities`, 60 `react-hooks/refs`, 42 unused vars, 18 `exhaustive-deps`). **v1 has no ESLint config, no `lint` script, and eslint is not a dependency**; its `package.json` `eslintConfig` extends a Create-React-App preset that has never run. Two of its rules are re-implemented as vitest assertions in `frontend/src/__tests__/lintRules.test.js`.

## 5. Dead code and unused surface

`knip` (v2 only; v1 is untyped JS): **10 unused files** (incl. `src/components/journal/QuestTasksSection.tsx`, `src/components/layouts/PreviewRoleBanner.tsx`, `src/components/lti/PlatformStorage.ts`, `src/components/portfolio/PortfolioSection.tsx`), **51 unused exports + 77 unused exported types** (worst: `useProfile.ts` 7, `useJournal.ts` 7, `useSchool.ts` 6, `useQuests.ts` 6, `useCourses.ts` 5), **5 unused deps** (`@gluestack-ui/nativewind-utils`, `@types/dompurify`, `expo-symbols`, `lightningcss`, `posthog-react-native`), 1 unused devDep, 7 unlisted imports.

`ts-prune` (v2): 115 exports with no external consumer, mostly Expo Router `default` exports (false positives).

`vulture` (backend, excl. tests/scripts): **6 findings at 100% confidence** — `routes/admin/bulk_import.py:126`, `routes/settings.py:40,55`, `services/interest_tracks_service.py:115`, `services/video_processing_service.py:122`, `utils/database_policy.py:48`. At 60% confidence 1,572, but that tier flags every decorator-registered route handler.

`pyflakes` backend: 175 findings, **0 undefined names**, 167 unused imports.

`npm audit`: v1 **15** (5 high / 8 moderate / 2 low), v2 **23** (5 high / 17 moderate / 1 low), **0 critical** either side. All highs are transitive DoS advisories (`brace-expansion`, `browserslist`, `nanoid`, `postcss`) with fixes available.

**Commented-out blocks ≥20 consecutive lines: 0.** TODO/FIXME/HACK/XXX: **23** in application source.

**Supabase (live prod `vvfgxcykxjybtvpfzwyx`: 241 tables, 2,678 columns, 116 functions, 302 policies, 0 tables without RLS):**
- **16 tables with zero code references**, live row counts: `portfolio_visibility_reset_20260801` 718, `sis_schedule_submissions` 87, `class_discussion_posts` 84, `email_templates` 15, `promo_interest` 13, `consultation_requests` 12, `automation_sequences` 4, `tutor_tier_limits` 4, `security_warnings_documentation` 2, `portfolio_visibility_reset_20260802` 2, `ai_seeds` 1, `buddies` 1, `docs_search_misses` 1, `lms_sessions` 1, `curriculum_settings` 0, `tutorial_verification_log` 0.
- Columns: sampled 40 across the 5 core tables; **3 have zero code references** — `quests.deactivation_reason`, `user_quest_tasks.verification_query`, `user_quest_tasks.auto_complete`.
- 117 functions defined in migrations, **34 distinct names reached by a `.rpc(` call**; the ~95 unmatched are largely trigger and RLS-helper functions invoked by Postgres. Six `.rpc` names are test fixtures (`echo`, `hello_world`, `function_a`, `test_truncate_all`, `exec_sql`, `execute_sql`).
- **No `supabase/functions/` directory — zero edge functions.**

**Orphan-ish surface:** `mockups/` (1 HTML), `design-system/` (4 markdown), `.design-sync/previews/` (12 TSX outside both apps), `docs/archive/` (unmaintained by its own header), `backend/scripts/` (81 one-off scripts). **Feature flags:** module gating is `MODULE_ENFORCEMENT = off|log|enforce`, **currently defaulted to `log`** — wired but passing everything through. Per-org flags live in `organizations.feature_flags` JSONB, not code constants.

## 6. Churn and hotspots

4,206 commits total, first 2025-08-23. **3,515 in the last 12 months** — ~9.6/day, but uneven: 649 (2025-10), 61 (2026-01), 434 (2026-08), 285 (2026-09 partial). Authors: Tanner Bowman 4,034, "Claude" 172.

| # | File | Commits | Lines | Test refs |
|---|---|---:|---:|---:|
| 1 | `frontend/src/App.jsx` | 172 | 815 | 6 |
| 2 | `backend/app.py` | 162 | 208 | 631 |
| 3 | `frontend/src/pages/QuestDetail.jsx` | 123 | 875 | **3** |
| 4 | `frontend/src/services/api.js` | 120 | 1,083 | 255 |
| 5 | `CLAUDE.md` | 106 | 634 | — |
| 6 | `docs/audit-2026-08/REMEDIATION_PLAN.md` | 105 | 3,964 | — |
| 7 | `frontend/src/pages/ParentDashboardPage.jsx` | 98 | 522 | **1** |
| 8 | `backend/services/email_service.py` | 84 | 1,965 | 43 |
| 9 | `frontend/src/pages/AdminPage.jsx` | 81 | 117 | 1 |
| 10 | `frontend/src/components/navigation/Sidebar.jsx` | 80 | 773 | **2** |
| 11 | `frontend/src/pages/HomePage.jsx` | 72 | *deleted* | — |
| 12 | `frontend/src/pages/DiplomaPage.jsx` | 71 | 962 | **2** |
| 13 | `backend/routes/sis/__init__.py` | 68 | 1,207 | 8 |
| 14 | `backend/routes/evidence_documents.py` | 68 | 1,259 | 8 |
| 15 | `backend/routes/auth.py` | 67 | *deleted* | — |
| 16 | `backend/routes/quests.py` | 64 | *deleted* | — |
| 17 | `backend/routes/admin/user_management.py` | 61 | 1,374 | 8 |
| 18 | `backend/routes/tasks.py` | 60 | *deleted* | — |
| 19 | `frontend/src/pages/DashboardPage.jsx` | 58 | 623 | **2** |
| 20 | `frontend/src/contexts/AuthContext.jsx` | 57 | 688 | 121 |

Five of the top 20 no longer exist — split into packages during the 2026-04 and 2026-09 decompositions.

**Large + high-churn + thinly tested** (>500 lines, >55 commits, ≤3 referencing test files): `QuestDetail.jsx` (875L/123/3), `DiplomaPage.jsx` (962L/71/2), `ParentDashboardPage.jsx` (522L/98/1), `Sidebar.jsx` (773L/80/2), `DashboardPage.jsx` (623L/58/2). **All five are v1 web pages.** Backend files in the same band (`email_service.py`, `sis_service.py`, `evidence_documents.py`) carry 8–86 referencing test files.

## 7. Deploy and operations

**Render** (`render.yaml`, workspace `tea-d9ah63qq4dsc739armqg`) declares 7 services: prod backend (`srv-d9sjl1f10e5c73a14610`, python, `main`, `rootDir: ""`, `pip install -r requirements.txt`, `cd backend && gunicorn app:app -c gunicorn.conf.py`), dev backend (`develop`), prod + dev static frontends, dev v2 web (`npx expo export --platform web`), marketing static (Astro, `rootDir: marketing`), and cron `daily-advisor-summary` (`*/10 * * * *` → `python jobs/cron_dispatch.py`), plus Redis for rate limiting. Static sites carry full CSP/HSTS/X-Frame-Options blocks. Auto-deploy **ON for dev, OFF for prod** — prod deploys only from `release.yml`'s `deploy` job, SHA-pinned, followed by a `smoke` job. **`render.yaml` is documentation, not live config** (OPS-02: live config is dashboard-only).

**Migrations are the largest drift in the repo.** `supabase/migrations/` holds 73 files (plus 124 archived); `supabase_migrations.schema_migrations` in prod holds **96 rows**. **Overlap is 5.** 67 repo files have no history row (a `db push` would attempt to re-apply them); 91 applied rows have no repo file. Nothing in any pipeline applies migrations: `migrate-prod.yml` is `workflow_dispatch`-only, defaults to `plan`, requires typing "APPLY TO PRODUCTION", and refuses above `max_pending: 3`. Migrations reach prod by hand (MCP `apply_migration`, SQL editor, local CLI); `db-exposure-audit.yml` runs daily as compensating control. This is OPS-03, still `NEEDS-USER`.

**Error monitoring covers all three surfaces.** Backend `sentry_sdk.init` at `backend/app.py:62`, release tied to `RENDER_GIT_COMMIT`, `send_default_pii=False`, with custom scopes in `middleware/csrf_protection.py`, `middleware/rate_limiter.py`, `modules/gate.py`, and the DB-truncation canary. Web v1 `@sentry/react` (`frontend/src/services/sentry.js`). Mobile v2 `@sentry/react-native` (`frontend-v2/src/services/sentry.ts`) with source maps uploaded on every OTA export. PostHog is wired on v1; v2's `posthog-react-native` is installed but unused.

**Environment: 127 distinct variable names** read across the backend. CLAUDE.md rule 9 requires access via `Config`; **78 direct `os.getenv`/`os.environ.get` calls remain outside `app_config.py`** — 21 in `gunicorn.conf.py`, 9 in `app.py`, the rest across 40+ one-off scripts. `MODULE_ENFORCEMENT` reads the environment directly by documented exception.

Client-exposed: v1 `VITE_API_URL`, `VITE_MARKETING_URL`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_SENTRY_DSN`/`_ENVIRONMENT`/`_RELEASE`, `VITE_POSTHOG_KEY`/`_HOST`, `VITE_GA_MEASUREMENT_ID`. v2 `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_SENTRY_DSN`, `EXPO_PUBLIC_SENTRY_REPLAY`. **None of these should be server-only** — anon keys, DSNs and analytics keys are publishable by design, and no service-role key, Stripe secret or Gemini key appears behind a `VITE_`/`EXPO_PUBLIC_` prefix in source or `render.yaml`. Server-only secrets (`SUPABASE_SERVICE_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `GEMINI_API_KEY`, `CRON_SECRET`) appear only on backend services.

## What I could not verify

- **Backend 56% is not directly comparable to CI's 41% floor.** Both use `--cov=.` from `backend/`, which puts `tests/` in the denominator, but CI's recorded 41.95% is from 2026-08-13 and I did not reproduce it on that commit.
- **One backend test failed in my coverage run** — `tests/unit/test_config_m5.py::test_jwt_secret_key_resolves_with_fallback`. Reproduced in isolation: it fails because I passed `FLASK_SECRET_KEY=t` (1 char, below the test's 16-char floor), not a code defect. The plain run with CI's key had 0 failures.
- **124 integration tests and both Playwright suites were not run** — they need a local Supabase stack and a live app. Pass/fail and runtime unmeasured; CI reports 133 integration tests green.
- **Timings are container-relative.** This runner is not GitHub's; 365 s / 271 s / 47 s indicate order of magnitude only.
- **The declared MCP server never connected** (HTTP 401). Live-database facts came from a *different* Supabase connection to the same project ref. I could not determine whether `.mcp.json`'s token is expired or misconfigured.
- **knip and ESLint ran on frontend-v2 only.** v1 is untyped JS with no ESLint config; its unused-file and unused-export surface is unmeasured.
- **`vulture` at 60% confidence (1,572 findings) is unusable as reported** — it flags every decorator-registered Flask view. Only the 6 at 100% confidence are trustworthy without per-item triage, which I did not do.
- **Unused columns were sampled, not enumerated** — 40 columns across 5 tables, out of 2,678 columns across 241 tables.
- **The 91 applied-but-fileless migrations were not read.** I compared version stamps only, so I cannot say whether the live schema holds objects no repo file describes, or whether those rows are re-stamped copies of archived files.
- **CLAUDE.md is not reproduced in full.** Including all 4,000 words conflicts with the 1,000–1,500 word budget; I kept the budget. The file is at the repo root, unchanged.
- **This report over-runs its word budget** (~2,300 vs 1,500). The density requirement and the budget are not simultaneously satisfiable at this repo size.
- **Nothing was run against the app.** No server started, no request issued against dev or prod. Behavioral claims rest on source reading, the test suites, and read-only SQL.
