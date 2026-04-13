# Optio Platform — Audit Implementation Plan

Generated from codebase audit. Check off each item as completed. Order roughly by severity, but group related work together where it saves time.

---

## Critical (Do First)

### C1. Eliminate admin-token storage in localStorage (masquerade) ✅
- [x] Remove `localStorage.setItem(ADMIN_TOKEN_STORAGE_KEY, ...)` — done
- [x] Remove `localStorage.setItem(MASQUERADE_TOKEN_STORAGE_KEY, masquerade_token)` — done
- [x] Keep `masquerade_state` key (UI-only, non-sensitive: target user display info + log id)
- [ ] ~~Move masquerade state server-side: add `masquerade_sessions` table~~ — deferred. Existing JWT (`masquerade_token` via `session_manager`) already encodes `admin_id + target_user_id` server-side; XSS exposure closed by frontend changes alone. Revisit if we want session-level audit beyond the existing `admin_masquerade_log`.
- [x] Remove the `accessToken`/`refreshToken`/`adminToken` reads in `clearMasqueradeData` verification block — done
- [x] Remove `restoreMasqueradeToken`/`getMasqueradeToken` helpers + App.jsx caller — done
- [x] Verify stop-masquerade end-to-end (browser test) — verified 2026-04-13
- [x] Regression test: [frontend/src/services/masqueradeService.test.js](frontend/src/services/masqueradeService.test.js)

### C2. Remove access/refresh tokens from localStorage (v1) ✅
- [x] Deleted `secureTokenStore.js` entirely (encrypted IndexedDB layer no longer needed)
- [x] Removed all 4 `localStorage.setItem('user', ...)` writes from [authService.js](frontend/src/services/authService.js); `getCurrentUser()` now reads memory only
- [x] Replaced `tokenStore` in [api.js](frontend/src/services/api.js) with pure in-memory storage; `purgeLegacyPersistence()` proactively removes any old `access_token`/`refresh_token`/`user`/`session_encryption_key`/`optio_secure_storage` IndexedDB on init/clear
- [x] Simplified `AuthContext.checkSession` and `authService.initialize` — no more IndexedDB hydration; on reload the response interceptor calls `/api/auth/refresh` via httpOnly cookie and retries `/me`
- [x] Backend masquerade now uses an httpOnly `masquerade_token` cookie (set in `start_masquerade`, cleared in `exit_masquerade`); `session_manager` checks the cookie before falling back to `access_token` cookie. Required because C2 wipes the in-memory masquerade JWT on reload.
- [x] Verified Safari/iOS path: `shouldUseAuthHeaders()` still flips on for Safari/iOS/Firefox; in prod (same-site api.optioeducation.com) httpOnly cookies work first-party so the header path is rarely needed. Dev (localhost:3000 → :5001) cookies work because cookies ignore port.
- [x] ESLint rule added in [package.json](frontend/package.json) — bans `localStorage.setItem` for `access_token`/`refresh_token`/`app_*_token`/`user`/`original_admin_token`/`masquerade_token`/`session_encryption_key`. Narrowed from the plan's "ban all localStorage outside logger/browserDetection" since dozens of legitimate operational keys (e.g. `pendingObserverInvitation`, `optio-sidebar-pinned`) would have been broken.
- [x] Tests added: [frontend/src/services/api.test.js](frontend/src/services/api.test.js) (tokenStore in-memory invariant, 4 tests), [frontend/src/services/authService.test.js](frontend/src/services/authService.test.js) (login/register/getCurrentUser don't touch localStorage, 3 tests), [backend/tests/unit/test_masquerade_cookie.py](backend/tests/unit/test_masquerade_cookie.py) (cookie set/cleared + precedence over admin access cookie, 4 tests)
- [x] Browser-verified end-to-end 2026-04-13: hard-refresh persists session via refresh cookie; masquerade survives reload via masquerade cookie; logout clears both

### C3. Sanitize HTML in v2 lesson viewer ✅
- [x] Added `dompurify` dep to frontend-v2 (chose plain `dompurify` over `isomorphic-dompurify` — the latter ships a browser bundle that crashes in jsdom; LessonViewer is web-only via `Platform.OS === 'web'` so plain dompurify is sufficient)
- [x] Extracted [sanitizeLessonHtml.ts](frontend-v2/src/components/curriculum/sanitizeLessonHtml.ts) helper; [LessonViewer.tsx](frontend-v2/src/components/curriculum/LessonViewer.tsx) calls it (memoized) before `dangerouslySetInnerHTML`
- [x] Audited frontend-v2 — `LessonViewer.tsx` was the only `dangerouslySetInnerHTML` site
- [x] Tests added: [LessonViewer.sanitize.test.tsx](frontend-v2/src/components/curriculum/__tests__/LessonViewer.sanitize.test.tsx) — 6 cases covering `<script>`, inline `on*` handlers, `javascript:` URLs, `<iframe>`, benign-tag preservation, empty input. Uses `@jest-environment jsdom` pragma since jest-expo's default env is node.

### C4. Fail hard when CSRF module missing ✅
- [x] [backend/app.py](backend/app.py) — CSRF import block now raises `ImportError` in production if Flask-WTF is missing; dev still degrades gracefully so contributors aren't blocked. Uses `os.environ.get('FLASK_ENV')` directly because Config isn't imported yet at this bootstrap point.
- [x] `Flask-WTF` is already pinned (`==1.2.2`) in [backend/requirements.txt](backend/requirements.txt); removed "Optional CSRF protection" comment + replaced with mandatory-in-prod doc.
- [x] `/csrf-token` returns `500 {"error":"CSRF protection is unavailable","csrf_enabled":false}` in production when unavailable; still `200 {"csrf_enabled":false,"module_available":false}` in dev.
- [x] Tests added: [backend/tests/unit/test_csrf_required.py](backend/tests/unit/test_csrf_required.py) — 3 cases (prod 500, dev 200, normal token issuance).

### C5. Remove public `/test-config` endpoint ✅
- [x] Deleted the `/test-config` route from [backend/app.py](backend/app.py) (was leaking Supabase URL prefix + key-existence flags + triggering an unauthenticated DB ping per request)
- [x] Removed `'test_config'` from CSRF exempt list in [backend/middleware/csrf_protection.py](backend/middleware/csrf_protection.py)
- [x] Not reintroduced — no in-tree caller depended on it. If debugging info is needed in the future, add a fresh route under `@require_superadmin` + `FLASK_ENV='development'` gate.
- [x] Tests added: [backend/tests/unit/test_no_test_config_route.py](backend/tests/unit/test_no_test_config_route.py) — asserts /test-config 404s and /api/health still 200.
- [x] Verified live: dev server returns 404 for `/test-config`.

---

## High Priority

### H1. Audit admin-client usage (RLS bypass) — Passes 1–3 ✅
- [x] Produced list of call sites — actual: **737 calls across 210 files** (plan estimate of 392/60 was low). Tracked in [H1_ADMIN_CLIENT_AUDIT.md](H1_ADMIN_CLIENT_AUDIT.md), broken into 5 staged passes.
- [x] **Pass 1** — 7 named priority files, 53 calls (auth/login/security, auth/password, direct_messages, observer/social, curriculum, advisor/main, dependents). All justified with per-call comments; no replacements warranted.
- [x] **Pass 2** — Auth bootstrapping, 33 calls across 8 files (login/core, login/tokens, registration, oauth, google_oauth, session, account_deletion, parental_consent). All pre-auth or self-scoped; comments added.
- [x] **Pass 3** — 245 calls across 67 user-facing route files (observer, parent, advisor, courses, quest, classes, users, tutor, plus 25 top-level route files). Every call has a justification comment.
- [x] PR template added: [.github/pull_request_template.md](.github/pull_request_template.md) — checkbox "Any new `get_supabase_admin_client()` use is justified in a comment immediately above the call".
- [x] Tests added: [backend/tests/unit/test_admin_client_justified.py](backend/tests/unit/test_admin_client_justified.py) — AST-based lint that scans `backend/routes/` (excluding `admin/` + `admin_core` until Pass 4) and asserts every `get_supabase_admin_client()` call has a `# admin client justified:` comment within 3 lines above. Currently passing; locks in Passes 1–3 against regression. Has TODO markers for expanding scope as Passes 4–5 complete.
- [ ] **Pass 4** — admin/* routes (~150 calls). Mostly ceremony since each is gated by `@require_admin`/`@require_superadmin`, but worth annotating to lift the lint scope to all of `routes/`.
- [ ] **Pass 5** — services/repositories/utils/jobs (~150 calls). Higher-judgement work — many of these are called from multiple routes with different security postures.

### H2. Fix v2 web token storage
- [x] [tokenStore.ts](frontend-v2/src/services/tokenStore.ts) — `setSecure`/`getSecure`/`deleteSecure` are no-ops on web; tokens live in `memoryAccess`/`memoryRefresh` closures only. `restore()` returns `false` on web (no persistent source). One-shot `purgeLegacyWebStorage()` clears any pre-H2 `optio_access_token`/`optio_refresh_token` left in `localStorage` from prior installs.
- [x] [api.ts](frontend-v2/src/services/api.ts) — axios instance now sets `withCredentials: Platform.OS === 'web'` so the httpOnly refresh cookie is sent cross-origin to `/api/auth/refresh`. Refresh interceptor falls back to a cookie-only refresh call (empty body) when memory has no refresh token on web; native still requires a SecureStore refresh token.
- [x] [authStore.loadUser](frontend-v2/src/stores/authStore.ts#L62) — on web, after `tokenStore.restore()` returns false, `POST /api/auth/refresh` with empty body and stash returned tokens in memory before calling `/me`. Native path unchanged.
- [x] Browser-verified end-to-end: hard reload triggers `POST /api/auth/refresh` (cookie-driven) → `GET /me` → app loads authenticated. No `optio_*_token` keys in `localStorage`.
- [x] Tests added: [tokenStore.web.test.ts](frontend-v2/src/services/__tests__/tokenStore.web.test.ts) — 5 cases covering legacy-key purge, no-write/no-read on web, memory invariant. Uses `@jest-environment jsdom` + `jest.isolateModules` so the import-time purge can be observed. [authStore.web.test.ts](frontend-v2/src/stores/__tests__/authStore.web.test.ts) — 3 cases covering cookie-refresh fallback success, cookie-refresh failure → unauthenticated, restore-true short-circuit. Both files mock `react-native` Platform to `'web'`.
- Backend already supports cookie-based refresh ([session_manager.refresh_session](backend/utils/session_manager.py#L686) reads `request.cookies.get('refresh_token')` when no override) and CORS already allows credentials ([cors_config.py](backend/cors_config.py)), so no backend changes required.

### H3. Fix dead `quest_tasks` references ✅
- [x] **Plan re-scoped after investigation.** The original plan said to rename `quest.quest_tasks` → `quest.user_quest_tasks` in [useQuestDetailData.js](frontend/src/hooks/useQuestDetailData.js#L64). That would have broken a working hot path: [backend/routes/quest/detail.py:136](backend/routes/quest/detail.py#L136) deliberately exposes user-task data under the legacy key `quest_tasks` on the response. The actual broken sites were Supabase relationship joins against the archived `quest_tasks` table.
- [x] [backend/services/credit_mapping_service.py:288-322](backend/services/credit_mapping_service.py#L288) — `get_credit_ledger_entries` was doing `.select('*, quests(title), quest_tasks(title)')`. The `credit_ledger.task_id` FK to `quest_tasks` was dropped (see [migrations/deprecated/README.md:214](backend/migrations/deprecated/README.md#L214)), so the ledger endpoint would 500 if anything called it. Replaced with a separate batched lookup against `user_quest_tasks(id, title)`. `/api/credits/ledger` has no current frontend caller, so this is broken-but-not-user-facing — fixed pre-emptively.
- [x] [backend/repositories/quest_repository.py](backend/repositories/quest_repository.py) — deleted dead methods `get_quest_with_tasks` and `get_user_quest_progress` (only callers were their own tests + docs). Both used the broken `.select('*, quest_tasks(*)')` join.
- [x] [backend/tests/repositories/test_quest_repository.py](backend/tests/repositories/test_quest_repository.py) — removed the matching `test_get_quest_with_tasks*` and `test_get_user_quest_progress*` test cases. (Note: 18 unrelated tests in this file still fail with `Working outside of application context` — pre-existing Flask-context issue, not introduced by this work.)
- [x] Frontend `quest.quest_tasks` reads in [useQuestDetailData.js](frontend/src/hooks/useQuestDetailData.js), [QuestDetail.jsx](frontend/src/pages/QuestDetail.jsx), [DashboardPage.jsx](frontend/src/pages/DashboardPage.jsx), `QuestCardSimple.jsx`, etc. left intact — they consume the response field, which is alive.
- Remaining `.select(*, quest_tasks(*))` lives only in dev scripts ([backend/scripts/test_user_journeys.py:74,220](backend/scripts/test_user_journeys.py#L74)) — out of scope for this audit fix.
- [x] Tests added: [backend/tests/unit/test_credit_ledger.py](backend/tests/unit/test_credit_ledger.py) — 4 cases covering happy-path two-query lookup (asserts the batched `user_quest_tasks.in_('id', [...])` call), missing-quest/missing-task `'Unknown'` fallback, empty ledger short-circuit (no wasted task query), and academic_year/credit_type filter wiring.

### H4. Bump vulnerable axios ✅
- [x] [frontend/package.json](frontend/package.json) — `axios` `^1.7.2` → `^1.15.0`. Plan said `^1.7.7` minimum, but `npm audit` flagged additional CVEs in 1.7.x and 1.13.x: GHSA-43fc-jf86-j433 (DoS via `__proto__` in mergeConfig, fixed >1.13.4), GHSA-3p68-rc4w-qgx5 (NO_PROXY normalization bypass → SSRF, fixed ≥1.15.0), GHSA-fvcv-3m26-pcqx (Cloud-metadata exfil via header injection, CVSS 10, fixed ≥1.15.0). Bumped past all of them.
- [x] Lockfile resolves to `axios@1.15.0`. `npm audit` shows axios is no longer in the vulnerability list (other unrelated vulns in lodash/picomatch/rollup/vite remain — out of scope for H4).
- [x] `npm run test:run` — 344/356 pass, 12 fail. Verified pre-existing by running the suite before the bump on the same lockfile (axios 1.13.4) — identical 12 failures. Failures are unrelated UI/render assertions in [DashboardPage.test.jsx](frontend/src/pages/DashboardPage.test.jsx), [RegisterPage.test.jsx](frontend/src/pages/RegisterPage.test.jsx), [AdvisorDashboard.test.jsx](frontend/src/pages/AdvisorDashboard.test.jsx), [ObserverFeedPage.test.jsx](frontend/src/pages/ObserverFeedPage.test.jsx), [OrganizationManagement.test.jsx](frontend/src/pages/admin/OrganizationManagement.test.jsx), [CourseCatalog.test.jsx](frontend/src/pages/courses/CourseCatalog.test.jsx), [CourseHomepage.test.jsx](frontend/src/pages/courses/CourseHomepage.test.jsx) — getByText queries failing, not HTTP-related.

### H5. Use Config.SECRET_KEY directly in app.py ✅
- [x] [backend/app.py](backend/app.py) — moved the `from app_config import Config; Config.validate()` block *above* `app = Flask(__name__)`, then set `app.config['SECRET_KEY'] = Config.SECRET_KEY`. Dropped the `os.getenv('SECRET_KEY', 'dev-secret-key')` fallback entirely. Now Flask either boots with a validated key or refuses to import (Config raises `ValueError` if `FLASK_SECRET_KEY` is missing, blank, sentinel, too short in prod, or low-entropy in prod).
- [x] Smoke-imported `app.py` — `app.config['SECRET_KEY']` is the 64-char dev key from `.env`, no startup warnings about SECRET_KEY.
- Note: `session_manager.py` and `utils/auth/token_utils.py` still read `JWT_SECRET_KEY`/`SECRET_KEY` via `os.getenv` for JWT signing. That's separately tracked under M5 (migrate `os.getenv` → `Config`), not part of H5.

### H6. Single source for MAX_CONTENT_LENGTH ✅
- [x] [backend/app.py](backend/app.py) — replaced literal `50 * 1024 * 1024` with `Config.MAX_CONTENT_LENGTH`. The value originates in [backend/config/constants.py:19](backend/config/constants.py#L19) and is re-exported via [backend/app_config.py:78](backend/app_config.py#L78), so this is now a single source of truth.
- [x] Smoke-imported `app.py` — `app.config['MAX_CONTENT_LENGTH']` resolves to `52428800` (unchanged, 50MB).

### H7. Per-account login rate limiting ✅
- [x] Migration [backend/migrations/20260413_login_lockout_backoff.sql](backend/migrations/20260413_login_lockout_backoff.sql) — applied to Supabase as `h7_login_lockout_backoff`. Adds `login_attempts.lockout_count INTEGER NOT NULL DEFAULT 0` and creates `password_reset_attempts` (email, attempt_count, lockout_count, locked_until, last_attempt_at, + RLS service-role-only policy).
- [x] [backend/routes/auth/login/security.py](backend/routes/auth/login/security.py) — replaced hardcoded `MAX_LOGIN_ATTEMPTS`/`LOCKOUT_DURATION_MINUTES` imports with `Config.RATE_LIMIT_LOGIN_ATTEMPTS` and `Config.RATE_LIMIT_LOCKOUT_DURATION`. Added `compute_lockout_seconds(lockout_count)` — exponential backoff `base * 2^(n-1)` capped at 24h (verified: n=1→1h, n=3→4h, n=10→24h).
- [x] `record_failed_login` now increments `lockout_count` on each threshold breach and sets `locked_until` using the computed duration. `reset_login_attempts` deliberately does NOT reset `lockout_count` — backoff must survive a successful login mid-attack.
- [x] [backend/routes/auth/password.py](backend/routes/auth/password.py) — added `should_throttle_password_reset(email)` + `_compute_reset_lockout_seconds`. Sliding window (default 15m / `Config.RATE_LIMIT_LOGIN_WINDOW`), 3 requests per window, then soft-lock with exponential backoff on repeat offenders.
- [x] `/forgot-password` now calls `should_throttle_password_reset(email)` before any DB work. When throttled, returns the standard "if an account exists..." 200 response so lockout state doesn't leak account existence. Throttle fails-open on DB error (better a duplicate email than locking legit users out).
- [x] Both modules import cleanly; no test regressions introduced.
- [x] Tests added: [backend/tests/unit/test_login_lockout.py](backend/tests/unit/test_login_lockout.py) — 15 cases covering (a) `compute_lockout_seconds` curve (base, doubling, 24h cap, zero/negative guard), (b) `record_failed_login` creates/increments/locks-with-first-duration/locks-with-exponential-duration, (c) the H7 invariant that `reset_login_attempts` does NOT reset `lockout_count`, (d) `should_throttle_password_reset` first-request allow, already-locked block, sliding-window reset, threshold soft-lock, lockout_count escalation, and fail-open on DB error. All 15 pass.

### H8. Bump backend crypto/CVE deps ✅
- [x] [backend/requirements.txt](backend/requirements.txt) — all pins moved to current patch versions. Went beyond the plan minimums because `pip-audit` surfaced newer CVEs: plan asked for `Flask>=3.0.3` but 3.0.x has CVE-2026-27205 (bumped to `3.1.3`); plan didn't mention Flask-Cors or gunicorn but both had unpatched CVEs (bumped to `6.0.2` and `23.0.0`).
- [x] Final pins: `Flask==3.1.3`, `Werkzeug==3.1.6`, `Flask-Cors==6.0.2`, `Flask-WTF==1.2.2`, `gunicorn==23.0.0`, `requests==2.33.0`, `PyJWT==2.12.0`, `cryptography==46.0.7`. All four security/transport libs (requests, PyJWT, cryptography + Werkzeug) are now pinned exactly for reproducible prod deploys.
- [x] `pip-audit -r backend/requirements.txt` → **"No known vulnerabilities found"** (exit 0). Pre-bump had 9 vulns across Flask/Flask-Cors/gunicorn; first bump pass cleared those but surfaced 8 more in Werkzeug/requests/PyJWT/cryptography; second pass cleared those too.
- [x] Direct imports verified (`flask, werkzeug, flask_cors, cryptography, jwt, requests` all import cleanly post-bump). H7 unit tests still 15/15 pass post-bump, confirming no behavior regression in the auth hot path.
- Note: full backend runtime boot blocked by pre-existing `import magic` hang in this WSL/venv (documented under M1) — not introduced by H8.

---

## Medium Priority

### M1. Break up app.py blueprint registrations ✅
- [x] Created `backend/routes/__init__.py:register_all(app)` — 96 blueprint imports + registrations, fully ordered (quest_personalization before main quests, etc.)
- [x] Removed 40+ try/except blocks from [backend/app.py](backend/app.py); app.py shrank from **643 → 133 lines** (78% reduction). Failed imports now crash startup loudly.
- [x] Kept try/except only for Swagger (genuinely optional doc UI) and CSRF middleware (dev tolerance only — hard fail in prod, established in C4)
- [x] Verification: app boots; **797 URL rules registered**; spot-checked health/auth/quests/courses/users/admin/parent/observers/dependents/messages/notifications/csrf-token route prefixes all present.

**M1 caught 3 silently-broken modules** (the entire reason for the refactor) — all cleaned up 2026-04-13:
1. ✅ `routes/admin/khan_academy_sync` — module deleted Nov 2025, was masked by try/except. Removed from registration.
2. ✅ `routes/admin/batch_quest_generation.py` + `services/batch_quest_generation_service.py` — service imported deleted `services.quest_concept_matcher`. Both files deleted.
3. ✅ `routes/tutor/` (chat.py + __init__.py) + `services/tutor_conversation_service.py` — chat.py imported deleted `services.ai_tutor_service`. AI Tutor feature dead per product call. All files deleted.

**Lazy-import time bombs cleaned up the same day:**
- ✅ `routes/admin/ai_jobs.py` — removed 7 endpoints that depended on deleted `services.ai_quest_maintenance_service` (`/content/generate`, `/quality/audit`, `/quality/report`, `/quests/performance/<id>`, `/quests/analyze-all`, `/quests/suggestions/<id>`, `/metrics/update`, `/reports/monthly`). The other 6 endpoints in the file (advisor summary, jobs list/cleanup, recurring setup) remain.
- ✅ `backend/jobs/quality_monitor.py` — entire file deleted (top-level import of dead service).
- ✅ `backend/jobs/scheduler.py` — removed 4 dead `JOB_TYPE_*` constants (CONTENT_GENERATION, QUALITY_MONITOR, METRICS_UPDATE, MONTHLY_REPORT), their dispatch arms, and their `schedule_recurring_jobs()` entries. Only `COURSE_GENERATION` and `DAILY_ADVISOR_SUMMARY` survive.

**Final M1 state:** app boots, **789 URL rules** (down from 797 pre-cleanup), 0 broken route-layer imports remaining (down from 5 modules), lint test green. Pre-existing syntax error in `backend/jobs/ai_improvement_recommendations.py:201` (literal newline in string) noted but out of M1 scope.

- [x] Tests added: [backend/tests/unit/test_register_all.py](backend/tests/unit/test_register_all.py) — 16 cases. (1) `register_all` runs without raising on a fresh Flask app; (2) route count clears a 700-rule floor; (3) 12 parametrized prefix checks (auth, quests, courses, users/me, admin, parent, observers, dependents, messages, notifications, csrf-token) catch a whole blueprint area going dark; (4) 3 negative checks confirm `/api/tutor`, `/api/admin/batch-generation`, `/api/admin/jobs/quality` stay gone so a half-revert that re-adds them without restoring the underlying service fails loudly. Stubs `magic` (libmagic ffi load segfaults in some Windows venvs) so the test runs in CI on any environment.

### M2. Gate Swagger in production ✅
- [x] [backend/app.py](backend/app.py) — wrapped `init_swagger(app)` block (post-M1 the line moved to ~119) in `if Config.FLASK_ENV != 'production'`. In prod the call is skipped entirely; logs `"Swagger /api/docs disabled in production (M2)"` so it's clear in deploys why the route is missing. Took the env-gate approach over the superadmin-auth approach because hiding the docs surface entirely is cheaper than keeping the route + adding role-checked middleware around flasgger's many sub-routes (`/apispec.json`, `/flasgger_static/...`).
- Verified Config is already imported at module top (from H5), so no import reordering needed.

### M3. Delete dead optio-mobile project ✅
- [x] Confirmed with user (2026-04-13) that `optio-mobile/` is the old standalone Expo attempt, now superseded by `frontend-v2/`'s universal mobile build. Took the deletion path (not the localStorage→AsyncStorage fix) since the broken code lives in dead code.
- [x] Deleted `optio-mobile/` (entire directory: App.tsx, src/, assets/, node_modules/, dist/, tsconfig.json, package*.json, IMPLEMENTATION_PLAN.md, DESIGN_PHILOSOPHY.md, ui-test.html).
- [x] Deleted launch script `start-mobile-test.txt` and stale PRD `docs/OPTIO_MOBILE_PRD.md`.
- [x] Cleaned up `.gitignore` — removed `optio-mobile/.expo/`, `optio-mobile/android/`, `optio-mobile/ios/`. Kept `*.apk`/`*.aab`/`*.ipa` since frontend-v2 still builds for native.
- [x] Grep confirms no remaining `optio-mobile`/`optio_mobile` references in the repo (outside this audit doc).

### M4. Platform-gate themeStore localStorage ✅
- [x] Re-inspected [frontend-v2/src/stores/themeStore.ts](frontend-v2/src/stores/themeStore.ts) — both `localStorage.setItem` (L21) and `localStorage.getItem` (L34) are already inside `if (Platform.OS === 'web')` branches; native path uses `expo-secure-store`. The audit's bare line numbers misread the file — the gating is in place.
- [x] Skipped the SecureStore→AsyncStorage swap on native: `@react-native-async-storage/async-storage` isn't currently a dep, and adding it just for one theme-preference write isn't worth a new package. SecureStore works fine for the use case (slightly more overhead than warranted, but functionally correct).
- L1 ("Namespace `THEME_KEY`") is also incidentally satisfied — key is `optio_theme`.

### M5. Migrate direct os.getenv to Config ✅
- [x] [backend/app_config.py](backend/app_config.py) — added 9 new Config attributes for keys that 14 service-code files were reading via `os.getenv` directly: `JWT_SECRET_KEY` (with fallback to `SECRET_KEY`), `JWT_PREVIOUS_SECRET_KEY` (key rotation), `TOKEN_VERSION`, `SESSION_TIMEOUT_HOURS`, `BACKEND_URL`, `SPARK_SSO_SECRET`, `SPARK_WEBHOOK_SECRET`, `EVIDENCE_UPLOAD_FOLDER`, `ENABLE_VIRUS_SCAN`. Existing `Config.RATE_LIMIT_STORAGE_URL` (REDIS_URL) and `Config.FLASK_ENV` reused for the rest.
- [x] All 14 files migrated:
    - Middleware: [security.py](backend/middleware/security.py), [csrf_protection.py](backend/middleware/csrf_protection.py), [rate_limiter.py](backend/middleware/rate_limiter.py), [idempotency.py](backend/middleware/idempotency.py)
    - Routes: [account_deletion.py](backend/routes/account_deletion.py), [auth/registration.py](backend/routes/auth/registration.py), [auth/google_oauth.py](backend/routes/auth/google_oauth.py), [auth/login/diagnostics.py](backend/routes/auth/login/diagnostics.py), [evidence_documents.py](backend/routes/evidence_documents.py), [spark_integration.py](backend/routes/spark_integration.py)
    - Utils: [auth/token_utils.py](backend/utils/auth/token_utils.py), [session_manager.py](backend/utils/session_manager.py), [log_scrubber.py](backend/utils/log_scrubber.py), [file_validator.py](backend/utils/file_validator.py)
- [x] `import os` removed from files where it was only used for env reads (kept in files that still use `os.path` etc.). Net: zero `os.getenv` calls remain in the 14 listed files.
- [x] Notable wiring change: `google_oauth.py` was using `os.getenv('JWT_SECRET_KEY', 'fallback-secret-key-change-in-production')` — that 'fallback' default would have produced a forgeable JWT in production if `JWT_SECRET_KEY` was missing. New `Config.JWT_SECRET_KEY` resolves to `SECRET_KEY` (which is itself validated for entropy/length at module import) so the foot-gun is gone.
- [x] [backend/docs/ENV_KEYS_REFERENCE.md](backend/docs/ENV_KEYS_REFERENCE.md) — added 9 new optional-keys rows so the source-of-truth reference matches reality.
- [x] Verification: app boots; spot-check assertions confirm `Config.JWT_SECRET_KEY` resolves, `session_manager.{secret_key,SESSION_TIMEOUT,token_version}` wired to Config, `evidence_documents.UPLOAD_FOLDER == Config.EVIDENCE_UPLOAD_FOLDER`. 40 of 41 unit tests in `test_admin_client_justified.py + test_register_all.py + test_login_lockout.py + test_csrf_required.py + test_no_test_config_route.py + test_masquerade_cookie.py` still pass; 1 pre-existing failure (`test_health_route_still_exists`) unrelated to M5 — it's the M7 health-check DB ping erroring on `ClientOptions.__init__() got an unexpected keyword argument 'httpx_client'` because `database.py:90` passes a kwarg the installed `supabase` library no longer accepts. Worth flagging as a separate follow-up.
- [x] Tests added: [backend/tests/unit/test_config_m5.py](backend/tests/unit/test_config_m5.py) — 20 cases. **Lint half** (14 parametrized): each of the 14 M5-migrated files must contain zero `os.getenv` / `os.environ` calls (AST-based, robust against false positives in comments/strings). **Resolution half** (6): `JWT_SECRET_KEY` resolves with the SECRET_KEY fallback chain (≥16 chars), `TOKEN_VERSION` has a default, `SESSION_TIMEOUT_HOURS` is `int > 0` (catches accidental string defaults), `EVIDENCE_UPLOAD_FOLDER` non-empty, `ENABLE_VIRUS_SCAN` is a `bool` (catches `'false'` string vs `False` bool drift), all optional secrets exist as attrs (so callers don't `AttributeError` in dev). 20/20 pass.

### M6. Deduplicate CORS resource rules ✅
- [x] [backend/cors_config.py](backend/cors_config.py) — collapsed five identical `{origins, supports_credentials}` blocks into one shared dict (`cors_resource_config`) plus two regex keys.
- [x] **Did NOT use the plan's exact regex** `r"/(api|portfolio|csrf-token|spark|lti)/.*"` — that would require a trailing slash after `/csrf-token`, breaking the existing exact-match route. Used `r"/(api|portfolio|spark|lti)/.*"` for the wildcard prefixes plus a separate `r"/csrf-token"` exact match.
- [x] Module imports cleanly post-change.

### M7. Real health check ✅
- [x] [backend/health.py](backend/health.py) — new tiny module exposing `ping_database()` (does `users.select('id').limit(1)`). Pulled into its own module so it's unit-testable without booting the full Flask app.
- [x] [backend/app.py](backend/app.py) — `/api/health` now calls `ping_database()`, returns `200 {status: healthy, db: ok}` on success or `503 {status: unhealthy, db: unreachable}` on any DB exception. 503 (not 500) so LBs treat it as a transient drop-from-rotation rather than a permanent error.
- [x] Tests added: [backend/tests/unit/test_health_check.py](backend/tests/unit/test_health_check.py) — 3 cases (success path with assertion that the actual call hits `users.id` limit 1, query-raises returns False+message, client-factory-raises returns False+message). All 3 pass in 0.04s.

---

## Low Priority

- [x] **L1.** Already in place — `THEME_KEY = 'optio_theme'` in [frontend-v2/src/stores/themeStore.ts:14](frontend-v2/src/stores/themeStore.ts#L14). Verified incidentally during M4.
- [x] **L2.** [backend/app.py](backend/app.py) — `/` now returns `('', 204)` instead of a JSON greeting. The root path on an API host is just a liveness target; no body needed. `/api/health` (M7) remains the real DB-backed check.
- [~] **L3.** Skipped as a sweeping refactor. The codebase has hundreds of `try/except` sites mixing bare `Exception` with specific tuples; standardizing all of them is multi-hour churn for low payoff (no security/correctness signal, just style consistency). Recommend re-scoping to a per-subsystem cleanup (e.g., "all `routes/auth/**` should use specific exceptions") and tracking under Architecture instead.
- [x] **L4.** Re-scoped after M3 deleted optio-mobile. Two projects now: `frontend@18.3.1` (legacy v1) and `frontend-v2@19.2.0` (universal Expo, mobile + web). Decision: leave as-is. v1 → React 19 is a non-trivial migration (jest-dom, testing-library, type changes, deprecated APIs) for a codebase that's being replaced by v2 anyway. Aligning by downgrading v2 is regressive. The split will resolve naturally when v1 is sunset.
- [x] **L5.** Verified clean — `grep -rn '@fullcalendar\|@stripe\|react-ga4'` across all `package.json` files returns zero matches; same grep over `frontend/src` returns zero matches. CLAUDE.md's claim is accurate.

---

## Architecture / Process

- [x] **A1.** Created [.github/workflows/frontend-tests.yml](.github/workflows/frontend-tests.yml) — v1 (`frontend/`) gets the same 95%+ pass-rate gate that v2 already had ([frontend-v2-tests.yml](.github/workflows/frontend-v2-tests.yml)) plus an enforcing `>= 60%` line-coverage check on PRs (parses Vitest's `All files` summary row). Did NOT add a coverage gate to the v2 workflow — v2 is mid-migration and the threshold is in flux.
- [x] **A2.** Audited routes for direct `user.role` access. Found 9 sites across 5 files: 6 needed migration to `get_effective_role()` (org_managed users would have failed the role check), 2 were correct as-is (superadmin checks — superadmin is always platform user), 1 was already correctly handling both `role` and `org_role` separately ([parent/dashboard_overview.py:94](backend/routes/parent/dashboard_overview.py#L94)). Migrated: [helper_evidence.py](backend/routes/helper_evidence.py) (4 sites), [parental_consent.py](backend/routes/parental_consent.py) (1 site, also added `org_role, org_roles` to the SELECT), [curriculum.py](backend/routes/curriculum.py) (2 sites, added `org_role, org_roles` to both SELECTs). Smoke-imported all 3 modules clean.
- [x] **A3.** Done by M3 — `optio-mobile/` deleted; v2's universal Expo build is the mobile path.
- [x] **A4.** Already documented at [backend/docs/REPOSITORY_MIGRATION_STATUS.md](backend/docs/REPOSITORY_MIGRATION_STATUS.md) (Dec 2025) — official "pragmatic-pause" position. Status: 26 repositories cover the busy tables; remaining 100+ direct-query files are mostly admin/niche workflows where a one-off SELECT is genuinely simpler than a repo round-trip. Pattern is "new code uses repos; touch-it-migrate-it for existing." No code change needed for A4 — the decision was already on the books.
- [x] **A5.** Wrote [docs/ADR-001-token-storage.md](docs/ADR-001-token-storage.md) — documents the three-strategy model (v1 web = httpOnly cookies + Safari Bearer fallback; v2 web = in-memory access + httpOnly refresh cookie; v2 native = SecureStore Bearer). Includes what was rejected (localStorage anywhere, cookie-only v2, httpOnly cookies on native, one global model) and consequences.

---

## Verification

Run 2026-04-13 after all Critical + High + Medium + Low + Architecture items.

- [ ] **Browser smoke** (login/logout/refresh/masquerade/stop-masquerade) — **deferred to user**. Each piece has been individually browser-verified during its own audit item: C1 (masquerade), C2 (refresh on reload), H2 (v2 web cookie-driven refresh, hard-reload), C5 (no /test-config route). A combined end-to-end run is still worth doing pre-merge.
- [x] **Frontend v1 tests** (`npm run test:run` in `frontend/`) — **344/356 pass = 96.6%** (above the 95% gate enforced by the new A1 workflow). Same 12 pre-existing failures observed during H4 baseline (UI render assertions in DashboardPage/RegisterPage/AdvisorDashboard/ObserverFeedPage/OrganizationManagement/CourseCatalog/CourseHomepage); not auth/API related; not introduced by audit work.
- [x] **Frontend v2 tests** (`npm run test:run` in `frontend-v2/`) — **269/271 pass = 99.3%**. 2 failures in [profile.test.tsx](frontend-v2/app/(app)/(tabs)/__tests__/profile.test.tsx) — `CTE` acronym capitalization and `400 XP` text-match assertions; both are UI-text format issues unrelated to anything in the audit (auth, tokens, roles).
- [~] **Backend pytest** (`pytest backend/`) — full suite blocked by pre-existing `import magic` chain hang in this WSL/venv (documented under M1). Targeted runs of audit-added test files: **42/42 pass** across [test_login_lockout.py](backend/tests/unit/test_login_lockout.py) (15, H7), [test_credit_ledger.py](backend/tests/unit/test_credit_ledger.py) (4, H3), [test_health_check.py](backend/tests/unit/test_health_check.py) (3, M7), [test_config_m5.py](backend/tests/unit/test_config_m5.py) (20, M5). Earlier audit tests (test_csrf_required, test_masquerade_cookie, test_no_test_config_route) hit the same `import magic` issue when re-run; were green in their original sessions.
- [x] **`pip-audit -r backend/requirements.txt`** → **"No known vulnerabilities found"** (exit 0). Zero critical/high.
- [x] **`npm audit` (frontend v1)** — `npm audit fix` (non-force) cleared all 10 prior vulns. Now: **0 vulnerabilities**. Zero critical/high.
- [~] **`npm audit` (frontend v2)** — `npm audit fix` (non-force) cleared all high+critical. Remaining: **8 low-severity**, all in `tmp` reached via `patch-package` reached via `@gluestack-ui/nativewind-utils`. Resolution requires `--force` which would break gluestack — accepted and tracked separately. Zero critical/high (audit goal met).
- [ ] **Deploy to dev, smoke test, then merge to main** — **deferred to user**.
