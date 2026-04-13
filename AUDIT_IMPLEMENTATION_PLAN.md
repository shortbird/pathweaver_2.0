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

### H1. Audit admin-client usage (RLS bypass)
- [ ] Produce list of all 392 `get_supabase_admin_client()` call sites (60 files)
- [ ] For each non-`admin/` route file, document justification or replace with `get_user_client()`
- [ ] Priority order: `auth/login/security.py`, `auth/password.py`, `direct_messages.py`, `observer/social.py`, `curriculum.py`, `advisor/main.py`, `dependents.py`
- [ ] Add defense-in-depth role check immediately before each remaining admin-client query
- [ ] Add a PR template checkbox: "New admin_client use is justified in comment above the call"

### H2. Fix v2 web token storage
- [ ] In [frontend-v2/src/services/tokenStore.ts:19-45](frontend-v2/src/services/tokenStore.ts#L19), remove `localStorage` branches on web
- [ ] Keep only `memoryAccess`/`memoryRefresh` closures on web
- [ ] On app boot (web), call refresh endpoint using httpOnly refresh cookie to restore access token
- [ ] Verify cross-tab behavior (new tabs get fresh token via refresh)

### H3. Fix dead `quest_tasks` reference in v1
- [ ] Rename `quest.quest_tasks` → `quest.user_quest_tasks` across [frontend/src/hooks/useQuestDetailData.js:64-166](frontend/src/hooks/useQuestDetailData.js#L64)
- [ ] Verify backend `/api/quests/:id` returns `user_quest_tasks` in response shape
- [ ] If backend still aliases to `quest_tasks`, update serializer to use canonical name
- [ ] Grep for any remaining `quest_tasks` (non-`user_quest_tasks`) references

### H4. Bump vulnerable axios
- [ ] Update `frontend/package.json`: `axios` → `^1.7.7`
- [ ] `npm install && npm run test:run` to verify no regression

### H5. Use Config.SECRET_KEY directly in app.py
- [ ] Replace [backend/app.py:51](backend/app.py#L51) with `app.config['SECRET_KEY'] = Config.SECRET_KEY`
- [ ] Remove the literal `'dev-secret-key'` fallback

### H6. Single source for MAX_CONTENT_LENGTH
- [ ] Replace [backend/app.py:52](backend/app.py#L52) with `app.config['MAX_CONTENT_LENGTH'] = Config.MAX_CONTENT_LENGTH`

### H7. Per-account login rate limiting
- [ ] Extend rate limiter at [backend/routes/auth/login/core.py:181](backend/routes/auth/login/core.py#L181) with per-email key
- [ ] Wire `Config.RATE_LIMIT_LOGIN_ATTEMPTS` / `RATE_LIMIT_LOGIN_WINDOW` / `RATE_LIMIT_LOCKOUT_DURATION` into actual enforcement
- [ ] Add exponential backoff per email
- [ ] Add same pattern to `password.py` reset endpoint

### H8. Bump backend crypto/CVE deps
- [ ] `Flask>=3.0.3`
- [ ] `Werkzeug>=3.0.3`
- [ ] `cryptography>=43.0.1`
- [ ] `PyJWT>=2.9.0`
- [ ] `requests>=2.32.3`
- [ ] Convert `>=` to pinned `==` for crypto libs (reproducible deploys)
- [ ] Run `pip-audit` and confirm clean

---

## Medium Priority

### M1. Break up app.py blueprint registrations
- [ ] Create `backend/routes/__init__.py:register_all(app)` that handles every blueprint
- [ ] Remove 50+ try/except blocks from [backend/app.py](backend/app.py); in production, failed blueprint import should crash startup
- [ ] Keep try/except only for genuinely optional modules (Stripe, Swagger)

### M2. Gate Swagger in production
- [ ] In [backend/app.py:642](backend/app.py#L642), wrap `init_swagger(app)` with `if Config.FLASK_ENV != 'production': ...`
- [ ] Or require superadmin auth on `/api/docs`

### M3. Fix optio-mobile broken localStorage
- [ ] Replace `localStorage.getItem/setItem` in [optio-mobile/src/utils/storage.ts:9,17](optio-mobile/src/utils/storage.ts#L9) with `AsyncStorage`
- [ ] Or, if `optio-mobile/` is abandoned, delete the directory entirely (confirm with team first)

### M4. Platform-gate themeStore localStorage
- [ ] Wrap `localStorage` calls in [frontend-v2/src/stores/themeStore.ts:21,34](frontend-v2/src/stores/themeStore.ts#L21) with `Platform.OS === 'web'` check
- [ ] Use AsyncStorage on native

### M5. Migrate direct os.getenv to Config
Files to migrate (per CLAUDE.md rule 8):
- [ ] `backend/middleware/security.py`
- [ ] `backend/middleware/csrf_protection.py`
- [ ] `backend/middleware/rate_limiter.py`
- [ ] `backend/middleware/idempotency.py`
- [ ] `backend/routes/account_deletion.py`
- [ ] `backend/routes/auth/registration.py`
- [ ] `backend/routes/auth/google_oauth.py`
- [ ] `backend/routes/auth/login/diagnostics.py`
- [ ] `backend/routes/evidence_documents.py`
- [ ] `backend/routes/spark_integration.py`
- [ ] `backend/utils/auth/token_utils.py`
- [ ] `backend/utils/session_manager.py`
- [ ] `backend/utils/log_scrubber.py`
- [ ] `backend/utils/file_validator.py`

### M6. Deduplicate CORS resource rules
- [ ] Collapse 5 identical `resources` entries in [backend/cors_config.py:20-46](backend/cors_config.py#L20) into single regex `r"/(api|portfolio|csrf-token|spark|lti)/.*"`

### M7. Real health check
- [ ] Update [backend/app.py:597-599](backend/app.py#L597) to ping Supabase with `select('id').limit(1)` on a lightweight table
- [ ] Return 503 if DB unreachable so load balancer removes instance

---

## Low Priority

- [ ] **L1.** Namespace `THEME_KEY` in frontend-v2 (prefix `optio_`)
- [ ] **L2.** Change root `/` route to return 204 instead of JSON (app.py:593-595)
- [ ] **L3.** Standardize exception granularity — pick either specific tuples or bare `Exception`, apply consistently
- [ ] **L4.** Align React versions across frontend (18.3.1), frontend-v2 (19.2.0), optio-mobile (19.1.0)
- [ ] **L5.** Confirm `@fullcalendar/*`, `@stripe/*`, `react-ga4` are fully removed (CLAUDE.md claims they are)

---

## Architecture / Process

- [ ] **A1.** Add CI gate on test thresholds: `npm run test:run` (95%+ pass) and `npm run test:coverage` (60%+) required before merge to `main`
- [ ] **A2.** Dedicated `get_effective_role()` audit — grep every route that compares `user.role` directly and replace with the helper
- [ ] **A3.** Decide on optio-mobile future: delete or merge with frontend-v2
- [ ] **A4.** Finish repository-pattern migration (15 repos exist, 60 route files still do direct Supabase queries) — or officially pause and document
- [ ] **A5.** Write one ADR documenting final token model: v1 = httpOnly only; v2 native = SecureStore Bearer; v2 web = in-memory + refresh cookie

---

## Verification

After all Critical + High items:
- [ ] Full browser test of login/logout/refresh/masquerade/stop-masquerade
- [ ] Run `npm run test:run` in `frontend/` and `frontend-v2/`
- [ ] Run `pytest` in `backend/`
- [ ] Run `pip-audit` and `npm audit` — zero critical/high
- [ ] Deploy to dev, smoke test, then merge to main
